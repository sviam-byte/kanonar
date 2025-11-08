import React from 'react';
import { Link } from 'react-router-dom';
import { useBranch } from '../contexts/BranchContext';
import { Branch } from '../types';

export const Header: React.FC = () => {
  const { branch, setBranch } = useBranch();

  return (
    <header className="bg-canon-bg-light border-b border-canon-border p-4 flex justify-between items-center sticky top-0 z-10">
      <div className="flex items-center space-x-8">
        <h1 className="text-xl font-bold text-canon-accent font-mono">
          <Link to="/">KANONAR 4.0</Link>
        </h1>
        <nav className="space-x-4">
          <Link to="/character" className="hover:text-canon-accent transition-colors">Персонажи</Link>
          <Link to="/object" className="hover:text-canon-accent transition-colors">Объекты</Link>
          <Link to="/concept" className="hover:text-canon-accent transition-colors">Концепты</Link>
          <Link to="/essence" className="hover:text-canon-accent transition-colors">Сущности</Link>
          <Link to="/simulations" className="hover:text-canon-accent transition-colors">Симуляции</Link>
          <Link to="/linter" className="hover:text-canon-accent transition-colors">Linter</Link>
        </nav>
      </div>
      <div>
        <select
          value={branch}
          onChange={(e) => setBranch(e.target.value as Branch)}
          className="bg-canon-bg border border-canon-border rounded px-3 py-1 font-mono focus:outline-none focus:ring-2 focus:ring-canon-accent"
        >
          <option value={Branch.Current}>Ветка: Текущая</option>
          <option value={Branch.PreRector}>Ветка: До-Ректора</option>
          <option value={Branch.PreBorders}>Ветка: До-Границ</option>
        </select>
      </div>
    </header>
  );
};
