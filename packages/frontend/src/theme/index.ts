import { extendTheme } from '@chakra-ui/react';

const theme = extendTheme({
  fonts: {
    heading: "'Inter', system-ui, sans-serif",
    body: "'Inter', system-ui, sans-serif",
  },
  colors: {
    brand: {
      50: '#f0fdf4',
      100: '#dcfce7',
      200: '#bbf7d0',
      300: '#86efac',
      400: '#4ade80',
      500: '#22c55e',
      600: '#16a34a',
      700: '#15803d',
      800: '#166534',
      900: '#14532d',
    },
  },
  shadows: {
    sm: '0 1px 2px 0 rgba(0,0,0,0.04), 0 1px 3px 0 rgba(0,0,0,0.06)',
    md: '0 2px 4px -1px rgba(0,0,0,0.04), 0 4px 6px -1px rgba(0,0,0,0.06)',
    lg: '0 4px 6px -2px rgba(0,0,0,0.04), 0 10px 15px -3px rgba(0,0,0,0.06)',
  },
  styles: {
    global: {
      body: { bg: 'gray.50' },
    },
  },
  components: {
    Card: {
      baseStyle: {
        container: {
          shadow: 'sm',
          borderRadius: 'xl',
          borderWidth: '1px',
          borderColor: 'gray.100',
        },
      },
    },
    Button: {
      baseStyle: {
        _focusVisible: {
          boxShadow: '0 0 0 3px var(--chakra-colors-brand-200)',
        },
        _active: {
          transform: 'scale(0.97)',
        },
      },
    },
    Input: {
      defaultProps: {
        focusBorderColor: 'brand.500',
      },
    },
    Select: {
      defaultProps: {
        focusBorderColor: 'brand.500',
      },
    },
    Textarea: {
      defaultProps: {
        focusBorderColor: 'brand.500',
      },
    },
    Table: {
      variants: {
        simple: {
          thead: {
            th: {
              bg: 'gray.50',
              borderBottom: '2px solid',
              borderColor: 'gray.200',
            },
          },
          tbody: {
            tr: {
              _even: { bg: 'gray.50' },
              _hover: { bg: 'blue.50' },
            },
          },
        },
      },
    },
    Badge: {
      baseStyle: {
        borderRadius: 'full',
      },
    },
    Tabs: {
      variants: {
        line: {
          tab: {
            _selected: {
              borderColor: 'brand.500',
              color: 'brand.600',
            },
          },
        },
      },
    },
  },
});

export default theme;
