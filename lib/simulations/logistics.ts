export interface LogisticsPayload {
  depots: { id: string; cap: number }[];
  routes: { from: string; to: string; lt: number; cap: number }[];
  demand: { to: string; daily: number }[];
  policy: string;
  days: number;
}

export interface DepotState {
  id: string;
  cap: number;
  inventory: number;
}

export interface Shipment {
  id: string;
  from: string;
  to: string;
  amount: number;
  departureDay: number;
  arrivalDay: number;
}

export interface LogisticsState {
  depots: Record<string, DepotState>;
  inTransit: Shipment[];
  backorders: number;
  filledOrders: number;
}

export function createInitialLogisticsState(payload: LogisticsPayload): LogisticsState {
  const depots: Record<string, DepotState> = {};
  payload.depots.forEach(d => {
    depots[d.id] = {
      id: d.id,
      cap: d.cap,
      inventory: d.id === 'core' ? d.cap : 0, // Assume only core starts full
    };
  });
  return {
    depots,
    inTransit: [],
    backorders: 0,
    filledOrders: 0,
  };
}


export function runLogisticsStep(
  currentState: LogisticsState,
  payload: LogisticsPayload,
  day: number
): LogisticsState {
  const nextState: LogisticsState = {
    depots: Object.fromEntries(
      Object.entries(currentState.depots).map(([key, value]) => [key, { ...value }])
    ),
    inTransit: [...currentState.inTransit],
    backorders: currentState.backorders,
    filledOrders: currentState.filledOrders,
  };

  // 1. Handle arrivals
  const arrivingShipments = nextState.inTransit.filter(s => s.arrivalDay === day);
  arrivingShipments.forEach(shipment => {
    const toDepot = nextState.depots[shipment.to];
    if (toDepot) {
        toDepot.inventory = Math.min(
            toDepot.cap,
            toDepot.inventory + shipment.amount
        );
    }
  });
  nextState.inTransit = nextState.inTransit.filter(s => s.arrivalDay !== day);

  // 2. Handle demand
  payload.demand.forEach(d => {
    const depot = nextState.depots[d.to];
    if (!depot) return;
    
    const demandAmount = d.daily;
    if (depot.inventory >= demandAmount) {
      depot.inventory -= demandAmount;
      nextState.filledOrders += demandAmount;
    } else {
      const fulfilled = depot.inventory;
      depot.inventory = 0;
      nextState.filledOrders += fulfilled;
      nextState.backorders += (demandAmount - fulfilled);
    }
  });

  // 3. Create new shipments from depots based on simple policy
   payload.routes.forEach(route => {
        const fromDepot = nextState.depots[route.from];
        const toDepot = nextState.depots[route.to];
        if (!fromDepot || !toDepot) return;

        // Simple policy: ship if destination is below 80% and there is stock at source
        if (toDepot.inventory / toDepot.cap < 0.8 && fromDepot.inventory > 0) {
            const amountToShip = Math.min(fromDepot.inventory, route.cap);
            if (amountToShip > 0) {
                 fromDepot.inventory -= amountToShip;
                 const newShipment: Shipment = {
                    id: `${route.from}-${route.to}-${day}`,
                    from: route.from,
                    to: route.to,
                    amount: amountToShip,
                    departureDay: day,
                    arrivalDay: day + route.lt,
                 };
                 nextState.inTransit.push(newShipment);
            }
        }
    });


  return nextState;
}
