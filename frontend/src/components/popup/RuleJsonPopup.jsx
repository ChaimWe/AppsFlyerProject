import React, { useState, useRef } from 'react';
import { Box, IconButton, TextField } from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { useThemeContext } from '../../context/ThemeContext';

/**
 * RuleJsonPopup component displays the raw JSON for a rule in a popup dialog.
 * Handles closing the popup.
 */
const RuleJsonPopup = ({ json }) => {
  const { getColor } = useThemeContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const matchRefs = useRef([]);

  const handleMatchNavigation = (direction) => {
    if (!json || !searchTerm) return;
    const regex = new RegExp(searchTerm, 'gi');
    const matches = json.match(regex) || [];
    if (matches.length === 0) return;

    setCurrentMatchIndex(prev => {
      const newIndex = direction === 'NEXT'
        ? (prev + 1) % matches.length
        : (prev - 1 + matches.length) % matches.length;

      setTimeout(() => {
        const matchElement = matchRefs.current[newIndex];
        if (matchElement) {
          matchElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 0);

      return newIndex;
    });
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        position: 'sticky',
        top: 0,
        backgroundColor: getColor('barBackground'),
        color: getColor('barText'),
        zIndex: 10,
        padding: '5px',
        borderBottom: '1px solid #ddd',
        display: 'flex',
        alignItems: 'center'
      }}>
        <TextField
          variant="outlined"
          size='small'
          placeholder="Search in JSON..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentMatchIndex(0);
          }}
          sx={{ mr: 1, width: '60%', backgroundColor: getColor('background'), input: { color: getColor('barText') } }}
        />
        <IconButton sx={{ color: getColor('barText') }} onClick={() => handleMatchNavigation('PREV')} size="small">
          <ArrowUpwardIcon fontSize="small" />
        </IconButton>
        <IconButton sx={{ color: getColor('barText') }} onClick={() => handleMatchNavigation('NEXT')} size="small">
          <ArrowDownwardIcon fontSize="small" />
        </IconButton>
        <span style={{ marginLeft: '8px', fontSize: '0.8em', color: getColor('barText') }}>
          {(() => {
            const totalMatches = searchTerm ? (json.match(new RegExp(searchTerm, 'gi')) || []).length : 0;
            return totalMatches > 0 ? `${currentMatchIndex + 1} / ${totalMatches}` : '0 / 0';
          })()}
        </span>
      </div>
      <div style={{
        color: getColor('barText'),
        backgroundColor: getColor('background'),
        padding: '15px',
        borderRadius: '4px',
        fontFamily: 'monospace',
        fontSize: '13px',
        lineHeight: '1.4',
        flex: 1,
        overflow: 'auto'
      }}>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordWrap: 'break-word', tabSize: 2 }}>
          {(!json || (typeof json === 'object' && Object.keys(json).length === 0)) ? (
            <div style={{ color: '#aaa', padding: 20 }}>No JSON data to display.</div>
          ) : (() => {
            let globalMatchIndex = 0;
            const jsonString = typeof json === 'string' ? json : JSON.stringify(json, null, 2);
            return jsonString.split('\n').map((line, i) => {
              const leadingSpaces = line.match(/^\s*/)[0].length;
              const parts = searchTerm ? line.split(new RegExp(`(${searchTerm})`, 'gi')) : [line];

              return (
                <div key={i} style={{ paddingLeft: `${leadingSpaces * 8}px` }}>
                  {parts.map((part, idx) => {
                    if (searchTerm && part.toLowerCase() === searchTerm.toLowerCase()) {
                      const matchIndex = globalMatchIndex++;
                      return (
                        <mark
                          key={idx}
                          ref={el => matchRefs.current[matchIndex] = el}
                          className={matchIndex === currentMatchIndex ? 'current-match' : ''}
                        >
                          {part}
                        </mark>
                      );
                    }
                    return part;
                  })}
                </div>
              );
            });
          })()}
        </pre>
      </div>
    </div>
  );
};

export default RuleJsonPopup;