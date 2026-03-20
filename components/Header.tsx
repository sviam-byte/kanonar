
import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ROUTES } from '../lib/appRoutes';
import { useBranch } from '../contexts/BranchContext';
import { useSandbox } from '../contexts/SandboxContext';
import { useAccess } from '../contexts/AccessContext';
import { Branch } from '../types';

const PATCH_REVISION = '8';

const NavDropdown: React.FC<{ label: string; active: boolean; colorClass?: string; children: React.ReactNode }> = ({ label, active, colorClass = "text-canon-text", children }) => {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-1 hover:opacity-80 transition-opacity font-bold text-sm ${active ? 'opacity-100' : 'opacity-70'} ${colorClass}`}
            >
                {label} <span className="text-[10px]">▼</span>
            </button>
            {isOpen && (
                <div className="absolute top-full left-0 mt-2 bg-canon-bg border border-canon-border rounded-md shadow-xl py-1 w-56 z-50 flex flex-col">
                    {children}
                </div>
            )}
        </div>
    );
};

const NavItem: React.FC<{ to: string | { pathname: string; hash?: string }; label: string; active: boolean }> = ({ to, label, active }) => (
    <Link
        to={to}
        className={`px-4 py-2 text-sm text-left hover:bg-canon-bg-light transition-colors ${active ? 'text-canon-text font-bold bg-canon-bg-light/50' : 'text-canon-text-light'}`}
    >
        {label}
    </Link>
);

export const Header: React.FC = () => {
  const { branch, setBranch } = useBranch();
  const { isAdmin, loginAdmin, logoutAdmin } = useSandbox();
  const { activeModule, setActiveModule, isRestricted } = useAccess();

  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;
  const isGroupActive = (paths: string[]) => paths.some(p => location.pathname.startsWith(p));
  const isHomeostasisActive = location.pathname === ROUTES.narrative.narrative && location.hash === '#homeostasis';

  const handleAdminToggle = () => {
      if (isAdmin) {
          logoutAdmin();
      } else {
          const pwd = prompt("Введите код доступа к ядру:");
          if (pwd) {
              if (!loginAdmin(pwd)) {
                  alert("Доступ запрещен.");
              }
          }
      }
  };

  return (
    // Responsive header: stacks on narrow screens, keeps desktop layout on xl+ breakpoints.
    <header className={`border-b p-3 md:p-4 sticky top-0 z-50 backdrop-blur-md transition-colors duration-500 ${isAdmin ? 'bg-red-950/80 border-red-900/50' : 'bg-canon-bg/90 border-canon-border'}`}>
      <div className="flex w-full flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center xl:gap-8">
        <Link to="/" className="text-lg font-bold text-canon-accent font-mono flex min-w-0 flex-wrap items-center gap-2 hover:opacity-80 transition-opacity">
          KANONAR 4.0
          <span className="text-[10px] bg-canon-blue/20 text-canon-blue px-1.5 py-0.5 rounded border border-canon-blue/40">{PATCH_REVISION}</span>
          {isAdmin && <span className="text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded uppercase tracking-wider">Admin</span>}
          {isRestricted && activeModule && (
             <div className="flex items-center gap-2 px-2 py-0.5 bg-yellow-500/10 border border-yellow-500/50 rounded ml-2">
                 <span className="text-[10px] text-yellow-500 font-bold uppercase tracking-wider max-w-[100px] truncate">
                     {activeModule.label}
                 </span>
                 <button
                    onClick={(e) => { e.preventDefault(); setActiveModule(null); }}
                    className="text-[10px] text-canon-text-light hover:text-white"
                    title="Выйти из модуля"
                 >
                    ✕
                 </button>
             </div>
          )}
        </Link>

        {/* Main Navigation Groups */}
        <nav className="flex flex-wrap items-center gap-3 md:gap-4 lg:gap-6">

            <NavDropdown
                label="Entities"
                active={isGroupActive(['/character', '/object', '/concept'])}
                colorClass="text-white"
            >
                <NavItem to={ROUTES.entities.character} label="Персонажи" active={isActive(ROUTES.entities.character)} />
                <NavItem to={ROUTES.entities.object} label="Объекты" active={isActive(ROUTES.entities.object)} />
                <NavItem to={ROUTES.entities.concept} label="Концепты" active={isActive(ROUTES.entities.concept)} />
                <NavItem to={ROUTES.entities.socialEvents} label="Соц. События (Log)" active={isActive(ROUTES.entities.socialEvents)} />
            </NavDropdown>

            <NavDropdown
                label="Simulation"
                active={isGroupActive(['/solver', '/scenarios'])}
                colorClass="text-canon-accent"
            >
                 <NavItem to={ROUTES.simulation.hub} label="Сценарный Хаб" active={isActive(ROUTES.simulation.hub)} />
                 <NavItem to={ROUTES.simulation.solver} label="Решатель (Debug)" active={isActive(ROUTES.simulation.solver)} />
            </NavDropdown>

            <NavDropdown
                label="Нарратив"
                active={isGroupActive(['/archetypes', '/archetype-relations', '/mass', '/narrative'])}
                colorClass="text-purple-400"
            >
                <NavItem to={ROUTES.narrative.narrative} label="Нарративный холст" active={isActive(ROUTES.narrative.narrative)} />
                <NavItem to={{ pathname: ROUTES.narrative.narrative, hash: '#homeostasis' }} label="Протокол гомеостаза" active={isHomeostasisActive} />
                <NavItem to={ROUTES.narrative.archetypes} label="Куб Архетипов" active={isActive(ROUTES.narrative.archetypes)} />
                <NavItem to={ROUTES.narrative.archetypeRelations} label="Граф Архетипов" active={isActive(ROUTES.narrative.archetypeRelations)} />
                <NavItem to={ROUTES.narrative.mass} label="Массовые Сети" active={isActive(ROUTES.narrative.mass)} />
            </NavDropdown>

            <NavDropdown
                label="Lab & Edit"
                active={isGroupActive([
                    ROUTES.labs.builder,
                    ROUTES.labs.characterLab,
                    ROUTES.labs.planningLab,
                    ROUTES.labs.dialogueLab,
                    ROUTES.labs.compare,
                    ROUTES.labs.biographyLab,
                    ROUTES.labs.presets,
                    ROUTES.labs.goalLab,
                    ROUTES.labs.goalLabConsole,
                    ROUTES.simulation.live,
                    ROUTES.labs.relationsLab,
                    ROUTES.labs.locationConstructor,
                ])}
                colorClass="text-green-400"
            >
                <NavItem to={ROUTES.labs.builder} label="Конструктор Персонажа" active={isActive(ROUTES.labs.builder)} />
                <NavItem to={ROUTES.labs.locationConstructor} label="Конструктор Локаций" active={isActive(ROUTES.labs.locationConstructor)} />
                <NavItem to={ROUTES.labs.characterLab} label="Инспектор ToM (Dyad)" active={isActive(ROUTES.labs.characterLab)} />
                <NavItem to={ROUTES.labs.goalLab} label="Лаборатория Целей" active={isActive(ROUTES.labs.goalLab)} />
                <NavItem to={ROUTES.simulation.live} label="▶ Live Sim" active={isActive(ROUTES.simulation.live)} />
                <NavItem to={ROUTES.labs.compare} label="⚖ Compare" active={isActive(ROUTES.labs.compare)} />
                <NavItem to={ROUTES.labs.relationsLab} label="Relations Lab (Global)" active={isActive(ROUTES.labs.relationsLab)} />
                <NavItem to={ROUTES.labs.planningLab} label="Лаборатория Планирования" active={isActive(ROUTES.labs.planningLab)} />
                <NavItem to={ROUTES.labs.dialogueLab} label="💬 Dialogue" active={isActive(ROUTES.labs.dialogueLab)} />
                <NavItem to={ROUTES.labs.biographyLab} label="Лаборатория Биографии" active={isActive(ROUTES.labs.biographyLab)} />
                <div className="border-t border-canon-border my-1"></div>
                <NavItem to={ROUTES.labs.presets} label="Редактор Пресетов" active={isActive(ROUTES.labs.presets)} />
                <NavItem to={ROUTES.labs.linter} label="Линтер & Справка" active={isActive(ROUTES.labs.linter)} />
            </NavDropdown>

        </nav>
      </div>

      <div className="flex flex-wrap items-center gap-3 md:gap-4 xl:self-auto">
        <Link
            to={ROUTES.inspector}
            className={`
                flex items-center gap-2 px-3 py-1 rounded text-xs font-bold transition-all border
                ${isActive('/inspector')
                    ? 'bg-canon-blue text-canon-bg border-canon-blue shadow-[0_0_10px_rgba(0,204,255,0.4)]'
                    : 'bg-transparent text-canon-blue border-canon-blue/30 hover:border-canon-blue hover:bg-canon-blue/10'
                }
            `}
        >
            <span>👁</span>
            <span>INSPECTOR</span>
        </Link>

        <div className="h-6 w-px bg-canon-border/50"></div>

        <select
          value={branch}
          onChange={(e) => setBranch(e.target.value as Branch)}
          className="bg-transparent text-canon-text-light text-xs font-mono focus:outline-none hover:text-canon-text cursor-pointer text-right"
        >
          <option value={Branch.Current}>Current</option>
          <option value={Branch.PreRector}>Pre-Rector</option>
          <option value={Branch.PreBorders}>Pre-Borders</option>
        </select>

        <button
            onClick={handleAdminToggle}
            className={`text-sm transition-transform hover:scale-110 ${isAdmin ? 'text-red-500' : 'text-canon-text-light hover:text-canon-text'}`}
            title={isAdmin ? "Admin Mode Active" : "Admin Login"}
        >
            {isAdmin ? '🔓' : '🔒'}
        </button>

        {!activeModule && (
             <Link to={ROUTES.access} className="text-xs text-canon-text-light hover:text-canon-accent font-mono" title="Ввести код доступа">
                 KEY
             </Link>
        )}
      </div>
      </div>
    </header>
  );
};
