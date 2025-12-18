
import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useBranch } from '../contexts/BranchContext';
import { useSandbox } from '../contexts/SandboxContext';
import { useAccess } from '../contexts/AccessContext';
import { Branch } from '../types';

const PATCH_REVISION = '6';

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
  const isGroupActive = (paths: string[]) => paths.some(p => location.pathname.startsWith(p));

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
    <header className={`border-b p-4 flex justify-between items-center sticky top-0 z-50 backdrop-blur-md transition-colors duration-500 ${isAdmin ? 'bg-red-950/80 border-red-900/50' : 'bg-canon-bg/90 border-canon-border'}`}>
      <div className="flex items-center gap-8">
        <Link to="/" className="text-lg font-bold text-canon-accent font-mono flex items-center gap-2 hover:opacity-80 transition-opacity">
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
        <nav className="flex items-center gap-6">
            
            <NavDropdown 
                label="Entities" 
                active={isGroupActive(['/character', '/object', '/concept'])}
                colorClass="text-white"
            >
                <NavItem to="/character" label="Персонажи" active={isActive('/character')} />
                <NavItem to="/object" label="Объекты" active={isActive('/object')} />
                <NavItem to="/concept" label="Концепты" active={isActive('/concept')} />
                <NavItem to="/social-events" label="Соц. События (Log)" active={isActive('/social-events')} />
            </NavDropdown>

            <NavDropdown 
                label="Simulation" 
                active={isGroupActive(['/social-simulator', '/runner', '/solver', '/scenarios', '/simulations'])}
                colorClass="text-canon-accent"
            >
                 <NavItem to="/social-simulator" label="Социальный Симулятор" active={isActive('/social-simulator')} />
                 <NavItem to="/scenarios" label="Сценарный Хаб" active={isActive('/scenarios')} />
                 <NavItem to="/solver" label="Решатель (Debug)" active={isActive('/solver')} />
                 <NavItem to="/runner" label="Матричный Runner" active={isActive('/runner')} />
                 <NavItem to="/simulations" label="Системные Модели" active={isActive('/simulations')} />
            </NavDropdown>

            <NavDropdown 
                label="Analysis" 
                active={isGroupActive(['/archetypes', '/archetype-relations', '/mass'])}
                colorClass="text-purple-400"
            >
                <NavItem to="/archetypes" label="Куб Архетипов" active={isActive('/archetypes')} />
                <NavItem to="/archetype-relations" label="Граф Архетипов" active={isActive('/archetype-relations')} />
                <NavItem to="/mass" label="Массовые Сети" active={isActive('/mass')} />
            </NavDropdown>

            <NavDropdown 
                label="Lab & Edit" 
                active={isGroupActive(['/builder', '/character-lab', '/planning-lab', '/dialogue-lab', '/biography-lab', '/presets', '/goal-lab'])}
                colorClass="text-green-400"
            >
                <NavItem to="/builder" label="Конструктор Персонажа" active={isActive('/builder')} />
                <NavItem to="/character-lab" label="Инспектор ToM (Dyad)" active={isActive('/character-lab')} />
                <NavItem to="/goal-lab" label="Лаборатория Целей" active={isActive('/goal-lab')} />
                <NavItem to="/planning-lab" label="Лаборатория Планирования" active={isActive('/planning-lab')} />
                <NavItem to="/dialogue-lab" label="Лаборатория Диалога" active={isActive('/dialogue-lab')} />
                <NavItem to="/biography-lab" label="Лаборатория Биографии" active={isActive('/biography-lab')} />
                <div className="border-t border-canon-border my-1"></div>
                <NavItem to="/presets" label="Редактор Пресетов" active={isActive('/presets')} />
                <NavItem to="/linter" label="Линтер & Справка" active={isActive('/linter')} />
            </NavDropdown>

        </nav>
      </div>
      
      <div className="flex items-center gap-4">
        <Link 
            to="/inspector" 
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
             <Link to="/access" className="text-xs text-canon-text-light hover:text-canon-accent font-mono" title="Ввести код доступа">
                 KEY
             </Link>
        )}
      </div>
    </header>
  );
};
