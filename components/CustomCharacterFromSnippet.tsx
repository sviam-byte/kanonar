
import React, { useState } from 'react';
import { CharacterEntity } from '../types';
import { decodeSnippetToCharacter } from '../lib/character-snippet';

interface Props {
  onAdd: (ch: CharacterEntity) => void;
}

export const CustomCharacterFromSnippet: React.FC<Props> = ({ onAdd }) => {
  const [snippet, setSnippet] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleAdd = () => {
    if (!snippet.trim()) return;
    try {
      setError(null);
      const ch = decodeSnippetToCharacter(snippet.trim());
      onAdd(ch);
      setSnippet('');
      alert(`Персонаж "${ch.title}" успешно добавлен!`);
    } catch (e: any) {
      setError(e.message ?? 'Не удалось прочитать код персонажа');
    }
  };

  return (
    <div className="border border-canon-border rounded-lg p-4 space-y-3 bg-canon-bg/30">
      <h3 className="font-bold text-sm text-canon-accent">Импорт по коду</h3>
      <p className="text-xs text-canon-text-light">Вставьте строку KANONAR4-CHAR::...</p>
      <textarea
        className="w-full h-20 border border-canon-border rounded px-3 py-2 font-mono text-[10px] bg-canon-bg text-canon-text focus:outline-none focus:border-canon-accent"
        value={snippet}
        onChange={e => setSnippet(e.target.value)}
        placeholder="KANONAR4-CHAR::v1::eyJ2Ijoi..."
      />
      {error && <div className="text-red-400 text-xs">{error}</div>}
      <button
        onClick={handleAdd}
        disabled={!snippet}
        className="px-4 py-1.5 rounded bg-canon-bg-light border border-canon-border text-canon-text text-xs font-bold hover:bg-canon-accent hover:text-canon-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Добавить персонажа
      </button>
    </div>
  );
};
