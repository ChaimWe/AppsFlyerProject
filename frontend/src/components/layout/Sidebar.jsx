import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  IconButton,
  Fade,
  Tooltip,
  Box,
} from '@mui/material';
import {
  AccountTree as TreeIcon,
  Menu as MenuIcon,
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon,
  ChevronLeft as ChevronLeftIcon,
  BugReport as DebugIcon,
  SmartToy as AIIcon
} from '@mui/icons-material';
import HomeIcon from '@mui/icons-material/Home';
import { useThemeContext } from '../../context/ThemeContext';

const drawerWidth = 240;

/**
 * Sidebar component renders the main navigation drawer with menu items and theme toggle.
 * Handles navigation and theme switching.
 */
export default function Sidebar({ view, setView }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { darkTheme, getColor } = useThemeContext();

  /**
   * Menu items for navigation and theme toggle.
   */
  const menuItems = [
    { key: 'home', label: 'Home', icon: <HomeIcon sx={{ color: getColor('barText') }} t='true' />, onClick: () => navigate('/') },
    { key: 'tree', label: 'WAF Tree', icon: <TreeIcon sx={{ color: getColor('barText') }} t='true' />, onClick: () => navigate('/app/visualization') },
    { key: 'debugger', label: 'Request Debugger', icon: <DebugIcon sx={{ color: getColor('barText') }} />, onClick: () => navigate('/app/debugger') },
    { key: 'ai', label: 'AI Assistant', icon: <AIIcon sx={{ color: getColor('barText') }} />, onClick: () => navigate('/app/ai') },
  ];

  return (
    <Drawer
      variant="permanent"
      open={open}
      sx={{
        zIndex: 1300,
        width: open ? drawerWidth : '80px',
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: open ? drawerWidth : '80px',
          boxSizing: 'border-box',
          background: darkTheme ? '#181818' : '#fff',
          color: darkTheme ? '#fff' : '#333',
          borderRight: 'none',
          boxShadow: '4px 0 12px rgba(0,0,0,0.1)',
          overflowX: 'hidden',
          transition: (theme) => theme.transitions.create('width', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
        },
      }}
    >
      <Toolbar
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          px: [1],
        }}
      >
        <IconButton onClick={() => setOpen(!open)}>
          {open ? <ChevronLeftIcon sx={{color: darkTheme ? '#fff' : '#333'}} /> : <MenuIcon sx={{color: darkTheme ? '#fff' : '#333'}} />}
        </IconButton>
      </Toolbar>
      <List>
        {menuItems.map((item) => (
          <ListItem key={item.key} disablePadding>
            <ListItemButton
              selected={!item.onClick && view === item.key}
              onClick={item.onClick || (() => setView(item.key))}
              sx={{
                minHeight: 48,
                justifyContent: 'initial',
                px: 2.5,
                '&.Mui-selected': {
                  bgcolor: getColor('selected'),
                  '&:hover': {
                    bgcolor: getColor('selectedHover'),
                  },
                },
                '&:hover': {
                  bgcolor: getColor('hover'),
                },
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 0,
                  mr: 2,
                  justifyContent: 'center',
                  color:
                    getColor('barText')
                }}
              >
                <Tooltip
                  title={!open ? item.label : ''}
                  placement="right"
                >
                  <span>{item.icon}</span>
                </Tooltip>
              </ListItemIcon>

              <Fade in={open} timeout={400} unmountOnExit>
                <ListItemText
                  primary={item.label}
                  sx={{
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    '& .MuiTypography-root': {
                      fontWeight: !item.onClick && view === item.key ? 600 : 400,
                      color: getColor('barText')
                    },
                  }}
                />
              </Fade>
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Drawer>
  );
}