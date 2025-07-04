import React, { useState, useEffect, useRef } from 'react';
import { Box, TextField, Button, Typography, CircularProgress, Paper, Select, MenuItem, FormControl, InputLabel, Switch, FormControlLabel } from '@mui/material';
import { useThemeContext } from '../../context/ThemeContext';
import OpenAI from 'openai';

// Instructions for different AI response styles
const styleInstructions = {
  concise: 'Summarize each rule briefly.',
  detailed: 'Provide a detailed, step-by-step explanation for each rule.',
  table: 'Return your answer as a markdown table, no extra text.',
  bullet: 'Return your answer as a list of bullet points, one per line, no extra text.',
  human: 'Explain the rules in simple, non-technical language.',
  json: 'Return only a JSON object as specified.'
};

/**
 * Parses markdown table text and extracts header and rows
 * @param {string} md - Markdown table string
 * @returns {Object|null} Object with header and rows arrays, or null if invalid
 */
function parseMarkdownTable(md) {
  const lines = md.trim().split(/\r?\n/).filter(line => line.trim().startsWith('|'));
  if (lines.length < 2) return null;
  const header = lines[0].split('|').map(cell => cell.trim()).filter(Boolean);
  const rows = lines.slice(2).map(line => line.split('|').map(cell => cell.trim()).filter(Boolean));
  return { header, rows };
}

/**
 * Renders a markdown table as HTML table with styling
 * @param {string} md - Markdown table string
 * @returns {JSX.Element} Styled HTML table
 */
function renderMarkdownTable(md) {
  const table = parseMarkdownTable(md);
  if (!table) return <span>{md}</span>;
  return (
    <table style={{ borderCollapse: 'collapse', width: '100%', margin: '8px 0' }}>
      <thead>
        <tr>
          {table.header.map((cell, i) => (
            <th key={i} style={{ border: '1px solid #ccc', padding: 4, background: '#f5f5f5', fontWeight: 'bold' }}>{cell}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j} style={{ border: '1px solid #ccc', padding: 4 }}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Renders JSON text as formatted code block
 * @param {string} text - JSON string (may be wrapped in code blocks)
 * @returns {JSX.Element} Formatted JSON display
 */
function renderJsonBlock(text) {
  let json = null;
  try {
    // Extract JSON from code block or plain text
    const match = text.match(/```json([\s\S]*?)```/i);
    if (match) {
      json = JSON.parse(match[1]);
    } else {
      json = JSON.parse(text.replace(/```json|```/g, ''));
    }
  } catch {
    return <pre style={{ background: '#f5f5f5', padding: 8, borderRadius: 4 }}>{text}</pre>;
  }
  return <pre style={{ background: '#f5f5f5', padding: 8, borderRadius: 4 }}>{JSON.stringify(json, null, 2)}</pre>;
}

/**
 * AI Assistant Chat Popup Component
 * Provides an interactive chat interface for asking questions about WAF rules
 */
const RuleChatPopup = ({ rule, allRules, edges = [], onClose, isAIPage = false }) => {
  const { getColor } = useThemeContext();
  const messagesEndRef = useRef(null);
  
  // Chat state management
  const [messages, setMessages] = useState([
    { sender: 'ai', text: 'Hi! Ask me anything about this rule and I will help you understand or improve it.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [responseStyle, setResponseStyle] = useState('concise');
  const [seeAllRules, setSeeAllRules] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState('normal');
  const [activeTab, setActiveTab] = useState('chat');
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [lastScrollTop, setLastScrollTop] = useState(0);

  // Calculate parent and child rules for the current rule
  const ruleId = String(rule?.id || '');
  const parentIds = edges.filter(e => String(e.target) === ruleId).map(e => String(e.source));
  const childIds = edges.filter(e => String(e.source) === ruleId).map(e => String(e.target));
  
  // Match rules by their position in the array (since edges use array indices as IDs)
  const parentRules = (allRules || []).filter((r, index) => parentIds.includes(String(index)));
  const childRules = (allRules || []).filter((r, index) => childIds.includes(String(index)));
  
  const parentNames = parentRules.map(r => r.Name).join(', ') || 'None';
  const childNames = childRules.map(r => r.Name).join(', ') || 'None';

  /**
   * Scrolls to the bottom of the messages container with dynamic timing
   * Duration is calculated based on response length and selected speed
   */
  const scrollToBottom = () => {
    if (scrollSpeed !== 'none' && messagesEndRef.current) {
      const container = messagesEndRef.current.parentElement;
      
      // Calculate scroll duration based on response length and selected speed
      const lastMessage = messages[messages.length - 1];
      const responseLength = lastMessage?.text?.length || 0;
      
      // Base duration per character (in milliseconds) 
      const baseDurationPerChar = {
        slow: 24.0,    // 24000ms per character 
        normal: 12.0,  // 12000ms per character 
        fast: 8.0,     // 8000ms per character 
        instant: 0     // No animation
      }[scrollSpeed] || 12.0;

      const scrollDuration = scrollSpeed === 'instant' ? 0 : Math.max(8000, responseLength * baseDurationPerChar);

      if (scrollDuration === 0) {
        // Instant scroll
        messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
        setUserScrolledUp(false);
      } else {
        // Custom smooth scroll with calculated duration
        const startTime = performance.now();
        const startScrollTop = container.scrollTop;
        const targetScrollTop = container.scrollHeight - container.clientHeight;
        const distance = targetScrollTop - startScrollTop;

        const animateScroll = (currentTime) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / scrollDuration, 1);
          
          // Easing function for smooth animation
          const easeOutQuart = 1 - Math.pow(1 - progress, 4);
          
          // Only auto-scroll if user hasn't manually scrolled up
          if (!userScrolledUp) {
            const expectedScrollTop = startScrollTop + (distance * easeOutQuart);
            container.scrollTop = expectedScrollTop;
          }
          
          if (progress < 1 && !userScrolledUp) {
            requestAnimationFrame(animateScroll);
          }
        };
        
        requestAnimationFrame(animateScroll);
      }
    }
  };

  // Handle manual scrolling
  const handleScroll = (e) => {
    const container = e.target;
    const currentScrollTop = container.scrollTop;
    const maxScrollTop = container.scrollHeight - container.clientHeight;
    
    // Check if user scrolled up manually
    if (currentScrollTop < lastScrollTop && currentScrollTop < maxScrollTop - 100) {
      setUserScrolledUp(true);
    }
    
    // Reset if user scrolls back to bottom
    if (currentScrollTop >= maxScrollTop - 50) {
      setUserScrolledUp(false);
    }
    
    setLastScrollTop(currentScrollTop);
  };

  // Auto-scroll when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollSpeed]);

  /**
   * Sends a message to the AI and handles the response
   */
  const sendMessage = async () => {
    if (!input.trim()) return;
    const userMsg = { sender: 'user', text: input };
    setMessages(msgs => [...msgs, userMsg]);
    setLoading(true);
    setInput('');
    try {
      const openai = new OpenAI({
        apiKey: import.meta.env.VITE_REACT_APP_OPENAI_API_KEY,
        dangerouslyAllowBrowser: true
      });
      const styleInstruction = styleInstructions[responseStyle] || styleInstructions.concise;
      const currentRuleInfo = rule?.id ? `The user is currently focused on rule #${parseInt(rule.id, 10) + 1}: ${rule.name || rule.Name || 'Unknown Rule'}` : 'The user is asking about their WAF rules in general.';
      const dependencyInfo = `Parent rules: ${parentNames}. Child rules: ${childNames}. When asked about dependencies, always use the provided parent and child rule information, not your own analysis.`;
      const relationshipInstruction = `\nIf the user asks about the relationship between the current rule and another rule, check if that rule is listed as a parent or child. If it is a child, say 'rule-X is a child of rule-Y.' If it is a parent, say 'rule-X is a parent of rule-Y.' If it is not in either list, say there is no direct relationship.`;
      const systemPrompt = `You are an expert in AWS WAF rules. The user will ask questions about their WAF rules. Always answer clearly and concisely, using the rule JSON provided. If the user asks for improvements, suggest best practices. Style: ${styleInstruction}\n${currentRuleInfo}\n${dependencyInfo}${relationshipInstruction}`;
      const contextRules = seeAllRules && Array.isArray(allRules) ? allRules : [rule];
      const chatHistory = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Rule JSON: ${JSON.stringify(contextRules, null, 2)}` },
      ];
      // Add previous user/ai messages
      messages.filter(m => m.sender !== 'ai' || m.text !== chatHistory[0].content).forEach(m => {
        chatHistory.push({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text });
      });
      chatHistory.push({ role: 'user', content: input });
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: chatHistory,
        temperature: 0.3
      });
      const aiText = response.choices[0].message.content;
      setMessages(msgs => [...msgs, { sender: 'ai', text: aiText }]);
    } catch (e) {
      setMessages(msgs => [...msgs, { sender: 'ai', text: 'Sorry, I could not get a response from the AI.' }]);
    }
    setLoading(false);
  };

  /**
   * Resets chat when response style changes
   */
  const handleStyleChange = (e) => {
    setResponseStyle(e.target.value);
    setMessages([
      { sender: 'ai', text: isAIPage ? 'Hi! Ask me anything about your WAF rules and I will help you understand, analyze, or improve them.' : (rule?.id ? 'Hi! Ask me anything about this rule and I will help you understand or improve it.' : 'Hi! Ask me anything about your WAF rules and I will help you understand, analyze, or improve them.') }
    ]);
    setInput('');
  };

  /**
   * Renders AI response according to selected style (bullet points, table, JSON, etc.)
   * @param {Object} msg - Message object with sender and text
   * @returns {JSX.Element} Formatted message content
   */
  const renderAiMessage = (msg) => {
    if (msg.sender !== 'ai') return <span>{msg.text}</span>;
    if (responseStyle === 'bullet') {
      // Split on newlines or dashes
      const lines = msg.text
        .split(/\n|\r/)
        .map(line => line.trim())
        .filter(line => line && (line.startsWith('-') || line.startsWith('•') || /^[a-zA-Z0-9]/.test(line)));
      return (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {lines.map((line, idx) => (
            <li key={idx} style={{ marginBottom: 4 }}>{line.replace(/^[-•]\s*/, '')}</li>
          ))}
        </ul>
      );
    }
    if (responseStyle === 'table' && msg.text.includes('|')) {
      return renderMarkdownTable(msg.text);
    }
    if (responseStyle === 'json') {
      return renderJsonBlock(msg.text);
    }
    // For detailed, human, concise: add bold headings if present
    if (['detailed', 'human', 'concise'].includes(responseStyle)) {
      // Convert markdown headings to bold
      const html = msg.text.replace(/^(#+)\s*(.*)$/gm, (m, hashes, title) => `<b>${title.trim()}</b>`)
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/\n/g, '<br/>');
      return <span dangerouslySetInnerHTML={{ __html: html }} />;
    }
    return <span>{msg.text}</span>;
  };

  /**
   * Handles clicking the overlay to close the popup
   */
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <Box
      sx={{
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 2000,
        background: `linear-gradient(135deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.3) 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)',
        animation: 'fadeIn 0.3s ease-out',
        '@keyframes fadeIn': {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 }
        }
      }}
      onClick={handleOverlayClick}
    >
      <Paper 
        sx={{ 
          width: 550, 
          maxWidth: '95vw', 
          height: '85vh',
          maxHeight: '85vh', 
          p: 3, 
          borderRadius: 3, 
          boxShadow: `0 20px 40px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.05)`,
          display: 'flex', 
          flexDirection: 'column',
          background: getColor('barBackground'),
          border: `1px solid ${getColor('border')}`,
          position: 'relative',
          overflow: 'auto',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '4px',
            background: 'linear-gradient(90deg, rgba(25, 118, 210, 0.6) 0%, rgba(46, 125, 50, 0.6) 50%, rgba(0, 137, 123, 0.6) 100%)',
            borderRadius: '12px 12px 0 0'
          },
          animation: 'slideIn 0.4s ease-out',
          '@keyframes slideIn': {
            '0%': { opacity: 0, transform: 'scale(0.9) translateY(20px)' },
            '100%': { opacity: 1, transform: 'scale(1) translateY(0)' }
          },
          '&::-webkit-scrollbar': {
            width: '8px',
          },
          '&::-webkit-scrollbar-track': {
            background: 'rgba(0,0,0,0.05)',
            borderRadius: '4px',
          },
          '&::-webkit-scrollbar-thumb': {
            background: 'linear-gradient(180deg, rgba(25, 118, 210, 0.4), rgba(46, 125, 50, 0.4))',
            borderRadius: '4px',
            '&:hover': {
              background: 'linear-gradient(180deg, rgba(25, 118, 210, 0.6), rgba(46, 125, 50, 0.6))',
            },
          },
        }}
      >
        <Typography 
          variant="h6" 
          sx={{ 
            mb: 2,
            background: 'linear-gradient(45deg, rgba(25, 118, 210, 0.7), rgba(46, 125, 50, 0.7))',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            fontWeight: 'bold',
            textAlign: 'center',
            fontSize: '1.3rem'
          }}
        >
          {isAIPage ? '🤖 AI Assistant for WAF Rules' : '🤖 AI Assistant for this Rule'}
        </Typography>
        
        {/* Tab Navigation */}
        <Box sx={{ display: 'flex', mb: 2, borderBottom: `1px solid ${getColor('border')}` }}>
          <Button
            onClick={() => setActiveTab('chat')}
            sx={{
              flex: 1,
              background: activeTab === 'chat' ? 'linear-gradient(45deg, rgba(25, 118, 210, 0.3), rgba(46, 125, 50, 0.3))' : 'transparent',
              color: activeTab === 'chat' ? getColor('barText') : getColor('barText'),
              borderRadius: 0,
              borderBottom: activeTab === 'chat' ? '3px solid rgba(25, 118, 210, 0.6)' : 'none',
              fontWeight: 'bold',
              textTransform: 'none',
              '&:hover': {
                background: activeTab === 'chat' ? 'linear-gradient(45deg, rgba(25, 118, 210, 0.4), rgba(46, 125, 50, 0.4))' : 'rgba(25, 118, 210, 0.05)',
              },
              transition: 'all 0.3s ease',
            }}
          >
            💬 Chat
          </Button>
          <Button
            onClick={() => setActiveTab('settings')}
            sx={{
              flex: 1,
              background: activeTab === 'settings' ? 'linear-gradient(45deg, rgba(25, 118, 210, 0.3), rgba(46, 125, 50, 0.3))' : 'transparent',
              color: activeTab === 'settings' ? getColor('barText') : getColor('barText'),
              borderRadius: 0,
              borderBottom: activeTab === 'settings' ? '3px solid rgba(25, 118, 210, 0.6)' : 'none',
              fontWeight: 'bold',
              textTransform: 'none',
              '&:hover': {
                background: activeTab === 'settings' ? 'linear-gradient(45deg, rgba(25, 118, 210, 0.4), rgba(46, 125, 50, 0.4))' : 'rgba(25, 118, 210, 0.05)',
              },
              transition: 'all 0.3s ease',
            }}
          >
            ⚙️ Settings
          </Button>
        </Box>

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <FormControl fullWidth>
                <InputLabel id="ai-style-label" sx={{ color: getColor('barText'), fontWeight: 500 }}>AI Response Style</InputLabel>
                <Select
                  labelId="ai-style-label"
                  value={responseStyle}
                  label="AI Response Style"
                  onChange={handleStyleChange}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      backgroundColor: getColor('background'),
                      '&:hover fieldset': {
                        borderColor: 'rgba(25, 118, 210, 0.4)',
                        borderWidth: '2px',
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: 'rgba(46, 125, 50, 0.4)',
                        borderWidth: '2px',
                      },
                      '&:hover': {
                        transform: 'translateY(-2px)',
                        transition: 'all 0.3s ease',
                        boxShadow: '0 4px 12px rgba(25, 118, 210, 0.1)',
                      },
                    },
                    '& .MuiSelect-select': {
                      fontWeight: 500,
                      color: getColor('barText'),
                    }
                  }}
                >
                  <MenuItem value="concise">📝 Concise</MenuItem>
                  <MenuItem value="detailed">🔍 Detailed</MenuItem>
                  <MenuItem value="table">📊 Table</MenuItem>
                  <MenuItem value="bullet">• Bullet Points</MenuItem>
                  <MenuItem value="human">👥 Human-Friendly</MenuItem>
                  <MenuItem value="json">⚙️ JSON Only</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel id="scroll-speed-label" sx={{ color: getColor('barText'), fontWeight: 500 }}>Scroll Speed</InputLabel>
                <Select
                  labelId="scroll-speed-label"
                  value={scrollSpeed}
                  label="Scroll Speed"
                  onChange={e => setScrollSpeed(e.target.value)}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      backgroundColor: getColor('background'),
                      '&:hover fieldset': {
                        borderColor: 'rgba(25, 118, 210, 0.4)',
                        borderWidth: '2px',
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: 'rgba(46, 125, 50, 0.4)',
                        borderWidth: '2px',
                      },
                      '&:hover': {
                        transform: 'translateY(-2px)',
                        transition: 'all 0.3s ease',
                        boxShadow: '0 4px 12px rgba(25, 118, 210, 0.1)',
                      },
                    },
                    '& .MuiSelect-select': {
                      fontWeight: 500,
                      color: getColor('barText'),
                    }
                  }}
                >
                  <MenuItem value="slow">🐌 Very Slow (24s/char)</MenuItem>
                  <MenuItem value="normal">⚡ Normal (12s/char)</MenuItem>
                  <MenuItem value="fast">🚀 Fast (8s/char)</MenuItem>
                  <MenuItem value="instant">⚡ Instant</MenuItem>
                  <MenuItem value="none">❌ No Auto-scroll</MenuItem>
                </Select>
              </FormControl>
            </Box>
            <Box sx={{ display: 'flex', gap: 3, alignItems: 'center', justifyContent: 'center' }}>
              <FormControlLabel
                control={
                  <Switch 
                    checked={seeAllRules} 
                    onChange={e => setSeeAllRules(e.target.checked)} 
                    sx={{
                      '& .MuiSwitch-switchBase.Mui-checked': {
                        color: 'rgba(25, 118, 210, 0.7)',
                        '&:hover': {
                          backgroundColor: 'rgba(25, 118, 210, 0.04)',
                        },
                      },
                      '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                        backgroundColor: 'rgba(46, 125, 50, 0.7)',
                      },
                    }}
                  />
                }
                label="AI sees all rules"
                sx={{ 
                  '& .MuiFormControlLabel-label': { 
                    fontWeight: 500,
                    color: getColor('barText')
                  } 
                }}
              />
            </Box>
          </Box>
        )}

        {/* Chat Area */}
        <Box 
          sx={{ 
            flex: 1, 
            overflowY: 'auto', 
            mb: 2, 
            background: getColor('background'),
            borderRadius: 2, 
            p: 2, 
            minHeight: activeTab === 'chat' ? 400 : 200,
            maxHeight: activeTab === 'chat' ? '60vh' : '40vh',
            border: `1px solid ${getColor('border')}`,
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)',
            '&::-webkit-scrollbar': {
              width: '8px',
            },
            '&::-webkit-scrollbar-track': {
              background: 'rgba(0,0,0,0.05)',
              borderRadius: '4px',
            },
            '&::-webkit-scrollbar-thumb': {
              background: 'linear-gradient(180deg, rgba(25, 118, 210, 0.4), rgba(46, 125, 50, 0.4))',
              borderRadius: '4px',
              '&:hover': {
                background: 'linear-gradient(180deg, rgba(25, 118, 210, 0.6), rgba(46, 125, 50, 0.6))',
              },
            },
          }}
          onScroll={handleScroll}
        >
          {messages.map((msg, i) => (
            <Box 
              key={i} 
              sx={{ 
                mb: 2, 
                textAlign: msg.sender === 'user' ? 'right' : 'left',
                animation: 'slideIn 0.5s ease-out',
                '@keyframes slideIn': {
                  '0%': { opacity: 0, transform: 'translateY(10px)' },
                  '100%': { opacity: 1, transform: 'translateY(0)' }
                }
              }}
            >
              <Typography 
                variant="body2" 
                sx={{
                  color: msg.sender === 'ai' ? 'rgba(25, 118, 210, 0.8)' : getColor('barText'),
                  fontWeight: 500,
                  background: msg.sender === 'ai' 
                    ? 'linear-gradient(135deg, rgba(25, 118, 210, 0.05) 0%, rgba(46, 125, 50, 0.05) 100%)'
                    : 'linear-gradient(135deg, rgba(0, 123, 255, 0.05) 0%, rgba(0, 86, 179, 0.05) 100%)',
                  padding: '8px 12px',
                  borderRadius: '12px',
                  border: `1px solid ${msg.sender === 'ai' ? 'rgba(25, 118, 210, 0.1)' : 'rgba(0, 123, 255, 0.1)'}`,
                  display: 'inline-block',
                  maxWidth: '85%',
                  wordWrap: 'break-word'
                }}
              >
                <b>{msg.sender === 'ai' ? '🤖 AI:' : '👤 You:'}</b> {renderAiMessage(msg)}
              </Typography>
            </Box>
          ))}
          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 2 }}>
              <CircularProgress 
                size={24} 
                sx={{ 
                  color: 'rgba(25, 118, 210, 0.7)',
                  '& .MuiCircularProgress-circle': {
                    strokeLinecap: 'round',
                  }
                }} 
              />
            </Box>
          )}
          <div ref={messagesEndRef} />
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            fullWidth
            size="small"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !loading && sendMessage()}
            placeholder="Ask about this rule..."
            disabled={loading}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                backgroundColor: getColor('background'),
                '&:hover fieldset': {
                  borderColor: 'rgba(25, 118, 210, 0.4)',
                  borderWidth: '2px',
                },
                '&.Mui-focused fieldset': {
                  borderColor: 'rgba(46, 125, 50, 0.4)',
                  borderWidth: '2px',
                },
                '&:hover': {
                  transform: 'translateY(-1px)',
                  transition: 'all 0.3s ease',
                  boxShadow: '0 4px 12px rgba(25, 118, 210, 0.08)',
                },
              },
              '& .MuiInputBase-input': {
                fontWeight: 500,
                color: getColor('barText'),
              }
            }}
          />
          <Button 
            onClick={sendMessage} 
            disabled={loading || !input.trim()} 
            variant="contained"
            sx={{
              background: 'linear-gradient(45deg, rgba(25, 118, 210, 0.3) 30%, rgba(46, 125, 50, 0.3) 90%)',
              boxShadow: '0 6px 20px rgba(25, 118, 210, 0.2)',
              borderRadius: 2,
              fontWeight: 'bold',
              textTransform: 'none',
              minWidth: '80px',
              color: getColor('barText'),
              textShadow: '0 1px 2px rgba(0,0,0,0.1)',
              '&:hover': {
                background: 'linear-gradient(45deg, rgba(25, 118, 210, 0.4) 30%, rgba(46, 125, 50, 0.4) 90%)',
                transform: 'translateY(-2px)',
                boxShadow: '0 8px 25px rgba(25, 118, 210, 0.3)',
              },
              '&:disabled': {
                background: 'linear-gradient(45deg, rgba(204, 204, 204, 0.3) 30%, rgba(153, 153, 153, 0.3) 90%)',
                boxShadow: 'none',
                transform: 'none',
                color: 'rgba(102, 102, 102, 0.7)',
              },
              transition: 'all 0.3s ease',
            }}
          >
            Send
          </Button>
        </Box>
        <Button 
          onClick={onClose} 
          sx={{ 
            mt: 1,
            background: 'linear-gradient(45deg, rgba(25, 118, 210, 0.6) 30%, rgba(46, 125, 50, 0.6) 90%)',
            boxShadow: '0 6px 20px rgba(25, 118, 210, 0.3)',
            borderRadius: 2,
            fontWeight: 'bold',
            textTransform: 'none',
            color: '#ffffff',
            textShadow: '0 1px 3px rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.2)',
            '&:hover': {
              background: 'linear-gradient(45deg, rgba(25, 118, 210, 0.8) 30%, rgba(46, 125, 50, 0.8) 90%)',
              transform: 'translateY(-2px)',
              boxShadow: '0 8px 25px rgba(25, 118, 210, 0.4)',
            },
            transition: 'all 0.3s ease',
          }} 
          color="secondary"
        >
          Close
        </Button>
      </Paper>
    </Box>
  );
};

/**
 * AIChatPanel - Full-page AI chat panel for the AI Assistant page
 * Reuses the chat UI and logic from RuleChatPopup, but as a full-page panel
 */
export function AIChatPanel({ rule, allRules, edges = [], isAIPage = false }) {
  // Copy all state, logic, and handlers from RuleChatPopup, but remove modal/popup logic
  // (Copy everything except the overlay/modal return, and use a normal Box/Paper layout)
  // ...
  // (Copy all state, useEffect, handlers, and the chat UI JSX)
  // ...
  // Replace the return with a full-page Box/Paper layout
  // ...
}

export default RuleChatPopup; 