import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { runCanonLinter } from '../lib/linter';
import { allEntities, entityMap } from '../data';
import { LintIssue } from '../types';

const severityStyles = {
  error: 'bg-red-800/50 border-red-500/60 text-canon-red',
  warn: 'bg-yellow-800/50 border-yellow-500/60 text-yellow-400',
  info: 'bg-blue-800/50 border-blue-500/60 text-canon-blue',
};

export const LinterPage: React.FC = () => {
  const issues = useMemo(() => runCanonLinter(allEntities, entityMap), []);

  const issueCounts = useMemo(() => {
    return issues.reduce((acc, issue) => {
      acc[issue.severity] = (acc[issue.severity] || 0) + 1;
      return acc;
    }, {} as Record<LintIssue['severity'], number>);
  }, [issues]);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-4xl font-bold mb-2">Canon Linter</h2>
        <p className="text-lg text-canon-text-light">
          Automated report on the consistency and integrity of the Kanonar data.
        </p>
      </div>

      <div className="flex justify-center gap-4 mb-8 font-mono">
        <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-canon-red">{issueCounts.error || 0}</div>
          <div className="text-sm text-canon-text-light">Errors</div>
        </div>
        <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-yellow-400">{issueCounts.warn || 0}</div>
          <div className="text-sm text-canon-text-light">Warnings</div>
        </div>
        <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-canon-text">{issues.length}</div>
          <div className="text-sm text-canon-text-light">Total Issues</div>
        </div>
      </div>

      <div className="bg-canon-bg-light border border-canon-border rounded-lg overflow-hidden">
        {issues.length > 0 ? (
          <table className="w-full text-left text-sm">
            <thead className="bg-canon-bg border-b border-canon-border">
              <tr>
                <th className="p-3">Severity</th>
                <th className="p-3">Entity</th>
                <th className="p-3">Type</th>
                <th className="p-3">Message</th>
              </tr>
            </thead>
            <tbody>
              {issues.map(issue => (
                <tr key={issue.id} className="border-b border-canon-border/50">
                  <td className={`p-3 capitalize font-bold ${severityStyles[issue.severity].split(' ').pop()}`}>
                    <span className={`px-2 py-1 rounded-full text-xs ${severityStyles[issue.severity]}`}>
                      {issue.severity}
                    </span>
                  </td>
                  <td className="p-3">
                    <Link to={`/${allEntities.find(e => e.entityId === issue.entityId)?.type}/${issue.entityId}`} className="text-canon-accent hover:underline">
                      {issue.entityTitle}
                    </Link>
                  </td>
                  <td className="p-3 font-mono text-canon-text-light">{issue.type}</td>
                  <td className="p-3">{issue.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-12 text-center">
            <h3 className="text-2xl font-bold text-canon-green">No issues found.</h3>
            <p className="text-canon-text-light mt-2">The canon data appears to be consistent.</p>
          </div>
        )}
      </div>
    </div>
  );
};