import React, { useMemo } from 'react';

interface LegendDetailPanelProps {
    onClose: () => void;
}

const getDifficultyMeta = [
    { label: 'Novice', slope: '< 10°', bg: 'bg-[#00a859]', text: 'text-white', hex: '#00a859' },
    { label: 'Easy', slope: '10° - 14º', bg: 'bg-[#0072bc]', text: 'text-white', hex: '#0072bc' },
    { label: 'Intermediate', slope: '15° - 24°', bg: 'bg-[#f0141e]', text: 'text-white', hex: '#f0141e' },
    { label: 'Expert', slope: '> 24°', bg: 'bg-black', text: 'text-white', hex: '#000000' },
    { label: 'Other', slope: '-', bg: 'bg-gray-400', text: 'text-white', hex: '#9ca3af' },
];

export const LegendDetailPanel: React.FC<LegendDetailPanelProps> = ({ onClose }) => {
    return (
        <div className="card absolute top-4 left-4 right-4 lg:bottom-auto lg:top-4 lg:left-72 lg:right-auto z-50 bg-base-100/95 backdrop-blur-md border border-base-300 shadow p-4 w-auto lg:w-auto max-h-[65vh] lg:max-h-[85vh] overflow-y-auto flex flex-col gap-3">
            <div className="flex justify-between items-start mb-2">
                <div className="text-xs text-gray-500 font-medium tracking-wide">
                    Leyend
                </div>
                <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-50 cursor-pointer"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            <div className="flex flex-row items-center gap-3 mb-3">
                <div className="card shadow bg-base-200">
                    <div className="card-body p-3">
                        {getDifficultyMeta.map((meta) => (
                            <div key={meta.label} className="flex items-center w-full">
                                <div className={`size-5 ${meta.bg} ${meta.text} rounded-sm mr-2`}></div>
                                {meta.label}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="card shadow bg-base-200 w-full">
                    <div className="card-body p-3 w-full">
                        <div className="card-title text-xs text-gray-500 font-medium tracking-wide mb-2">
                            Downhill / Ski Tour Slope Grading
                        </div>

                        <div className="flex flex-row gap-2 w-full">
                            {getDifficultyMeta.filter(meta => meta.label !== 'Other').map((meta) => (
                                <div key={meta.label} className="flex flex-col items-center justify-center w-18">
                                    <div className={`w-16 h-3 ${meta.bg} rounded-sm mr-2`}></div>
                                    <span className="text-no-wrap text-center w-full">{meta.slope}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
