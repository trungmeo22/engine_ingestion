import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Hash, GitBranch, Bookmark, CornerDownRight } from 'lucide-react';
import { Section } from '../types';

interface SectionTreeViewerProps {
  sections: Section[];
  selectedSectionId?: string | null;
  onSelectSection?: (sectionId: string) => void;
}

export const SectionTreeViewer: React.FC<SectionTreeViewerProps> = ({
  sections,
  selectedSectionId,
  onSelectSection,
}) => {
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({});

  // Group sections by parent_section_id
  const sectionMap = React.useMemo(() => {
    const map = new Map<string, Section>();
    sections.forEach((s) => map.set(s.section_id, s));
    return map;
  }, [sections]);

  const childrenMap = React.useMemo(() => {
    const map = new Map<string | null, Section[]>();
    sections.forEach((s) => {
      const parent =
        s.parent_section_id && sectionMap.has(s.parent_section_id)
          ? s.parent_section_id
          : null;
      if (!map.has(parent)) {
        map.set(parent, []);
      }
      map.get(parent)!.push(s);
    });
    // Sort by order_index
    map.forEach((list) => list.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)));
    return map;
  }, [sections, sectionMap]);

  const toggleCollapse = (sectionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedNodes((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  const renderSectionNode = (section: Section, depth: number = 0) => {
    const children = childrenMap.get(section.section_id) || [];
    const hasChildren = children.length > 0;
    const isCollapsed = !!collapsedNodes[section.section_id];
    const isSelected = selectedSectionId === section.section_id;

    // Badge styling based on level
    const levelColors = [
      'bg-sky-100 text-sky-800 border-sky-300 font-bold',
      'bg-indigo-100 text-indigo-800 border-indigo-300 font-semibold',
      'bg-purple-100 text-purple-800 border-purple-300 font-medium',
      'bg-emerald-100 text-emerald-800 border-emerald-300 font-medium',
    ];
    const badgeColor = levelColors[Math.min(section.level - 1, levelColors.length - 1)];

    return (
      <div key={section.section_id} className="relative">
        <div
          onClick={() => onSelectSection && onSelectSection(section.section_id)}
          style={{ paddingLeft: `${Math.max(depth * 20, 8)}px` }}
          className={`group flex items-start gap-2.5 py-2 px-3 rounded-lg text-xs transition-all cursor-pointer border ${
            isSelected
              ? 'bg-sky-50/90 border-sky-400 text-sky-950 shadow-xs'
              : 'border-transparent hover:bg-slate-100/90 text-slate-700 hover:border-slate-200'
          }`}
        >
          {/* Collapse Toggle or Leaf icon */}
          <div className="pt-0.5 shrink-0">
            {hasChildren ? (
              <button
                onClick={(e) => toggleCollapse(section.section_id, e)}
                className="p-0.5 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
              >
                {isCollapsed ? (
                  <ChevronRight className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            ) : (
              <CornerDownRight className="w-3.5 h-3.5 text-slate-300 ml-0.5" />
            )}
          </div>

          {/* Numbering badge (e.g. 5.1.1) */}
          <span
            className={`shrink-0 px-2 py-0.5 rounded text-[11px] font-mono border ${badgeColor}`}
          >
            {section.numbering_path || `L${section.level}`}
          </span>

          {/* Section Title & Breadcrumb */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className={`font-medium truncate ${isSelected ? 'font-bold text-sky-900' : 'text-slate-800'}`}>
                {section.title}
              </span>
              <span className="text-[10px] text-slate-400 font-mono shrink-0">
                idx: {section.order_index}
              </span>
            </div>

            {section.breadcrumb && (
              <p className="text-[11px] text-slate-500 truncate mt-0.5 font-sans" title={section.breadcrumb}>
                ↳ <span className="italic">{section.breadcrumb}</span>
              </p>
            )}

            {section.parent_section_id && (
              <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                <span className="flex items-center gap-1 font-mono">
                  <GitBranch className="w-2.5 h-2.5" />
                  parent: {section.parent_section_id}
                </span>
                <span>•</span>
                <span>level: {section.level}</span>
              </div>
            )}
          </div>
        </div>

        {/* Render child sections if not collapsed */}
        {hasChildren && !isCollapsed && (
          <div className="ml-3 pl-2 border-l-2 border-slate-200/80 my-1 space-y-1">
            {children.map((child) => renderSectionNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const rootSections = childrenMap.get(null) || [];

  if (sections.length === 0) {
    return (
      <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
        <Bookmark className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm font-medium text-slate-600">Document contains no parsed sections.</p>
        <p className="text-xs text-slate-400 mt-1">This document does not contain structural numbered headings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 bg-white p-3 rounded-xl border border-slate-200">
      <div className="flex items-center justify-between px-2 pb-2 mb-2 border-b border-slate-100 text-xs text-slate-500 font-medium">
        <span className="flex items-center gap-1.5 font-semibold text-slate-700">
          <Hash className="w-3.5 h-3.5 text-sky-600" />
          Canonical Hierarchy Tree ({sections.length} sections)
        </span>
        <span className="text-[11px] text-slate-400">
          Preserving 5 → 5.1 → 5.1.1 Parent-Child relations
        </span>
      </div>

      <div className="space-y-1 max-h-[550px] overflow-y-auto pr-1">
        {rootSections.map((sec) => renderSectionNode(sec, 0))}
      </div>
    </div>
  );
};
