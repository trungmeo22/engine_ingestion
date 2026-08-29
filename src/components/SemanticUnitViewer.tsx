import React, { useState } from 'react';
import {
  FileText,
  Activity,
  Table as TableIcon,
  Image,
  MapPin,
  Filter,
  Check,
  Search,
  Hash,
  ExternalLink,
} from 'lucide-react';
import { SemanticUnit, UnitType, UnitClassification } from '../types';

interface SemanticUnitViewerProps {
  units: SemanticUnit[];
  activeSectionId?: string | null;
  onClearSectionFilter?: () => void;
}

export const SemanticUnitViewer: React.FC<SemanticUnitViewerProps> = ({
  units,
  activeSectionId,
  onClearSectionFilter,
}) => {
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedClassification, setSelectedClassification] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Filter units
  const filteredUnits = React.useMemo(() => {
    return units.filter((u) => {
      if (activeSectionId && u.section_id !== activeSectionId) return false;
      if (selectedType !== 'all' && u.unit_type !== selectedType) return false;
      if (selectedClassification !== 'all' && u.classification !== selectedClassification) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const text = u.text_content.toLowerCase();
        const breadcrumb = (u.breadcrumb || '').toLowerCase();
        if (!text.includes(query) && !breadcrumb.includes(query) && !u.unit_id.toLowerCase().includes(query)) {
          return false;
        }
      }
      return true;
    });
  }, [units, activeSectionId, selectedType, selectedClassification, searchQuery]);

  const getClassificationBadge = (classification: UnitClassification) => {
    switch (classification) {
      case 'clinical_marker':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-300 shadow-2xs">
            <Activity className="w-2.5 h-2.5 text-purple-600" />
            Clinical Marker
          </span>
        );
      case 'metadata':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
            Metadata
          </span>
        );
      case 'disclaimer':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 border border-amber-200">
            Disclaimer
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-50 text-sky-700 border border-sky-200">
            Content
          </span>
        );
    }
  };

  const getTypeIcon = (type: UnitType) => {
    switch (type) {
      case 'heading':
        return <Hash className="w-3.5 h-3.5 text-indigo-500" />;
      case 'table':
        return <TableIcon className="w-3.5 h-3.5 text-teal-600" />;
      case 'figure':
        return <Image className="w-3.5 h-3.5 text-orange-500" />;
      default:
        return <FileText className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  return (
    <div className="space-y-3">
      {/* Filter and Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          {/* Search box */}
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search units text, tokens (e.g., 'Class I', '10 mg', 'eGFR')..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 focus:bg-white transition-all placeholder:text-slate-400"
            />
          </div>

          {/* Quick Filter Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Unit Type select */}
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value="all">All Types</option>
              <option value="heading">Headings</option>
              <option value="paragraph">Paragraphs</option>
              <option value="table">Tables</option>
              <option value="figure">Figures</option>
            </select>

            {/* Classification select */}
            <select
              value={selectedClassification}
              onChange={(e) => setSelectedClassification(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value="all">All Classifications</option>
              <option value="clinical_marker">⚡ Clinical Markers Only</option>
              <option value="content">Content</option>
              <option value="metadata">Metadata</option>
            </select>
          </div>
        </div>

        {/* Active Section Filter Notice */}
        {activeSectionId && (
          <div className="flex items-center justify-between text-xs bg-sky-50 border border-sky-200 text-sky-900 px-3 py-1.5 rounded-lg">
            <span>
              Filtering by section: <strong className="font-mono">{activeSectionId}</strong>
            </span>
            <button
              onClick={onClearSectionFilter}
              className="text-sky-700 hover:text-sky-900 font-semibold underline cursor-pointer"
            >
              Clear Section Filter
            </button>
          </div>
        )}
      </div>

      {/* Semantic Units List */}
      <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
        {filteredUnits.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-xl border border-slate-200 text-slate-500 text-xs">
            No semantic units match the current filters.
          </div>
        ) : (
          filteredUnits.map((unit) => {
            const bbox = unit.provenance.bbox;
            const isClinical = unit.classification === 'clinical_marker';

            return (
              <div
                key={unit.unit_id}
                className={`bg-white rounded-xl border p-3.5 transition-all space-y-2 ${
                  isClinical
                    ? 'border-purple-200 bg-purple-50/20 shadow-2xs'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Card Header: Unit ID, Type, Classification, Provenance */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 font-mono text-xs font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                      {getTypeIcon(unit.unit_type)}
                      {unit.unit_id}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono uppercase">
                      {unit.unit_type}
                    </span>
                    {getClassificationBadge(unit.classification)}
                  </div>

                  {/* Provenance Box Details */}
                  <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200">
                    <MapPin className="w-3 h-3 text-rose-500" />
                    <span>Page {unit.provenance.page}</span>
                    <span className="text-slate-300">•</span>
                    <span>
                      bbox: [{bbox.l.toFixed(0)}, {bbox.t.toFixed(0)}, {bbox.r.toFixed(0)}, {bbox.b.toFixed(0)}]
                    </span>
                  </div>
                </div>

                {/* Section & Breadcrumb Path */}
                <div className="text-[11px] text-slate-500 bg-slate-50/80 px-2 py-1 rounded border border-slate-100 flex items-center justify-between">
                  <span className="truncate">
                    Section: <strong className="font-mono text-slate-700">{unit.section_id}</strong>
                    {unit.breadcrumb && (
                      <span className="text-slate-600 italic ml-1.5">({unit.breadcrumb})</span>
                    )}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono shrink-0 ml-2">
                    order: {unit.order_index}
                  </span>
                </div>

                {/* Content / Table / Figure Render */}
                {unit.unit_type === 'table' && unit.table_data ? (
                  <div className="space-y-2 pt-1">
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                      <table className="min-w-full divide-y divide-slate-200 text-xs">
                        <thead className="bg-slate-50 font-semibold text-slate-700">
                          <tr>
                            {unit.table_data.headers.map((h, hIdx) => (
                              <th key={hIdx} className="px-3 py-2 text-left font-medium">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {unit.table_data.rows.map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-slate-50/80">
                              {row.map((cell, cIdx) => (
                                <td key={cIdx} className="px-3 py-1.5 text-slate-700">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {unit.text_content && (
                      <pre className="text-[11px] bg-slate-900 text-slate-100 p-2.5 rounded-lg overflow-x-auto font-mono">
                        {unit.text_content}
                      </pre>
                    )}
                  </div>
                ) : unit.unit_type === 'figure' ? (
                  <div className="p-3 bg-amber-50/50 border border-amber-200 rounded-lg text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold text-amber-800">
                      <Image className="w-3.5 h-3.5" />
                      Extracted Diagram / Figure Unit
                    </div>
                    <p className="text-slate-800">{unit.text_content}</p>
                    {unit.caption && (
                      <p className="text-[11px] text-slate-500 italic">Caption: {unit.caption}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap font-sans">
                    {unit.text_content}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
