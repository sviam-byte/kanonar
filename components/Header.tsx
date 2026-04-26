import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAccess } from '../contexts/AccessContext';
import { useBranch } from '../contexts/BranchContext';
import { useSandbox } from '../contexts/SandboxContext';
import { Branch } from '../types';

const PATCH_REVISION = '8';

const NavDropdown: React.FC<{
  label: string;
  active: boolean;
  colorClass?: string;
  children: React.ReactNode;
}> = ({ label, active, colorClass = 'text-canon-text', children }) => {
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
        {label} <span className="text-[10px]">v</span>
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 bg-canon-bg border border-canon-border rounded-md shadow-xl py-1 w-56 z-50 flex flex-col">
          {children}
        </div>
      )}
    </div>
  );
};

const NavItem: React.FC<{ to: string; label: string; active: boolean }> = ({ to, label, active }) => (
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
  const isGroupActive = (paths: string[]) => paths.some((p) => location.pathname.startsWith(p));
  const isHomeostasisActive = location.pathname === '/narrative' && location.hash === '#homeostasis';

  const handleAdminToggle = () => {
    if (isAdmin) {
      logoutAdmin();
      return;
    }

    const pwd = prompt('Введите код доступа к ядру:');
    if (pwd && !loginAdmin(pwd)) {
      alert('Доступ запрещен.');
    }
  };

  return (
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
                  onClick={(e) => {
                    e.preventDefault();
                    setActiveModule(null);
                  }}
                  className="text-[10px] text-canon-text-light hover:text-white"
                  title="Выйти из модуля"
                >
                  x
                </button>
              </div>
            )}
          </Link>

          <nav className="flex flex-wrap items-center gap-3 md:gap-4 lg:gap-6">
            <NavDropdown
              label="Entities"
              active={isGroupActive(['/character', '/location', '/object', '/concept'])}
              colorClass="text-white"
            >
              <NavItem to="/character" label="Персонажи" active={isActive('/character')} />
              <NavItem to="/location" label="Локации" active={isActive('/location')} />
              <NavItem to="/object" label="Объекты" active={isActive('/object')} />
              <NavItem to="/concept" label="Концепты" active={isActive('/concept')} />
            </NavDropdown>

            <NavDropdown
              label="Lab"
              active={isGroupActive(['/builder', '/goal-lab-v2', '/goal-lab-console-v2', '/simulator', '/relations-lab', '/location-constructor', '/conflict-lab'])}
              colorClass="text-green-400"
            >
              <NavItem to="/goal-lab-v2" label="GoalLab" active={isActive('/goal-lab-v2')} />
              <NavItem to="/goal-lab-console-v2" label="Инспектор целей" active={isActive('/goal-lab-console-v2')} />
              <NavItem to="/builder" label="Конструктор персонажа" active={isActive('/builder')} />
              <NavItem to="/location-constructor" label="Конструктор локаций" active={isActive('/location-constructor')} />
              <NavItem to="/conflict-lab" label="Conflict Lab" active={isActive('/conflict-lab')} />
              <NavItem to="/simulator" label="Live Sim" active={isActive('/simulator')} />
              <NavItem to="/relations-lab" label="Relations Lab" active={isActive('/relations-lab')} />
            </NavDropdown>

            <NavDropdown
              label="Narrative"
              active={isGroupActive(['/narrative', '/archetypes', '/archetype-relations'])}
              colorClass="text-purple-400"
            >
              <NavItem to="/narrative" label="Нарративный холст" active={isActive('/narrative') && !location.hash} />
              <NavItem to="/narrative#homeostasis" label="Протокол гомеостаза" active={isHomeostasisActive} />
              <NavItem to="/archetypes" label="Куб архетипов" active={isActive('/archetypes')} />
              <NavItem to="/archetype-relations" label="Граф архетипов" active={isActive('/archetype-relations')} />
            </NavDropdown>
          </nav>
        </div>

        <div className="flex flex-wrap items-center gap-3 md:gap-4 xl:self-auto">
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
            title={isAdmin ? 'Admin Mode Active' : 'Admin Login'}
          >
            {isAdmin ? 'UNLOCK' : 'LOCK'}
          </button>

          {!activeModule && (
            <Link to="/access" className="text-xs text-canon-text-light hover:text-canon-accent font-mono" title="Ввести код доступа">
              KEY
            </Link>
          )}
        </div>
      </div>
    </header>
  );
};
