
import React from 'react';
import { Link } from 'react-router-dom';
import { EntityType } from '../types';

const entryPoints = [
    { type: EntityType.Character, name: "Персонажи", description: "Существа, формирующие повествование." },
    { type: EntityType.Location, name: "Места", description: "Локации, имеющие значение." },
    { type: EntityType.Object, name: "Объекты", description: "Артефакты с онтологическим весом." },
    { type: EntityType.Concept, name: "Концепты", description: "Культурные и системные абстракции." },
    { type: "events", name: "Система Событий", description: "Управление потоком времени, социальными интеракциями и системными триггерами.", link: "/events" },
    { type: "goal-lab", name: "GoalLab", description: "Лаборатория контекста, оркестратора и симулятора.", link: "/goal-lab" },
    { type: EntityType.Protocol, name: "Протоколы", description: "Правила, связывающие реальность." },
]

export const HomePage: React.FC = () => {
  return (
    <div className="p-8">
      <div className="text-center mb-12">
        <h2 className="text-4xl font-bold mb-2">Добро пожаловать в Ядро Гомеостаза</h2>
        <p className="text-lg text-canon-text-light max-w-3xl mx-auto">
          Это основной интерфейс для Kanonar 4.0. Исследуйте сущности, управляйте параметрами для симуляции их стабильности и наблюдайте за последствиями в рамках установленных моделей реальности.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {entryPoints.map(entry => (
             <Link key={entry.type} to={entry.link || `/${entry.type}`} className="block p-6 bg-canon-bg-light border border-canon-border rounded-lg hover:border-canon-accent hover:shadow-lg hover:shadow-canon-accent/10 transition-all transform hover:-translate-y-1">
                <h3 className="text-2xl font-bold text-canon-accent mb-2">{entry.name}</h3>
                <p className="text-canon-text-light">{entry.description}</p>
            </Link>
        ))}
      </div>
    </div>
  );
};
