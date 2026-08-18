import type { Config } from "tailwindcss";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		screens: {
			xs: '480px',
			sm: '640px',
			md: '768px',
			lg: '1024px',
			xl: '1280px',
			'2xl': '1536px'
		},
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				},
				// EOE Mechanic Colors
				spacecraft: 'hsl(var(--spacecraft))',
				station: 'hsl(var(--station))',
				warp: 'hsl(var(--warp))',
				void: 'hsl(var(--void))',
				planet: 'hsl(var(--planet))',
				// Card Type Colors
				'type-commander': 'hsl(var(--type-commander))',
				'type-lands': 'hsl(var(--type-lands))',
				'type-creatures': 'hsl(var(--type-creatures))',
				'type-instants': 'hsl(var(--type-instants))',
				'type-sorceries': 'hsl(var(--type-sorceries))',
				'type-enchantments': 'hsl(var(--type-enchantments))',
				'type-artifacts': 'hsl(var(--type-artifacts))',
				'type-planeswalkers': 'hsl(var(--type-planeswalkers))',
				'type-battles': 'hsl(var(--type-battles))',
				// MTG mana identity — referenced across the app but previously
				// unregistered, so every mana-* utility emitted no CSS.
				mana: {
					white: 'hsl(var(--mana-white))',
					blue: 'hsl(var(--mana-blue))',
					black: 'hsl(var(--mana-black))',
					red: 'hsl(var(--mana-red))',
					green: 'hsl(var(--mana-green))',
					colorless: 'hsl(var(--mana-colorless))',
					multicolor: 'hsl(var(--mana-multicolor))'
				},
				// Power level — the underlying vars were RGB triplets in hsl(),
				// which rendered every badge near-white. Now real HSL.
				power: {
					1: 'hsl(var(--power-1))',
					4: 'hsl(var(--power-4))',
					7: 'hsl(var(--power-7))',
					10: 'hsl(var(--power-10))'
				}
			},
			backgroundImage: {
				'cosmic': 'var(--gradient-cosmic)',
				'nebula': 'var(--gradient-nebula)',
				'starfield': 'var(--gradient-starfield)',
				'gradient-primary': 'var(--gradient-primary)',
				'gradient-cosmic': 'var(--gradient-cosmic)',
				'gradient-nebula': 'var(--gradient-nebula)'
			},
			// shadow-glow-* appeared ~49 times but there was no boxShadow
			// extension at all, so every hover glow was a no-op.
			boxShadow: {
				'glow-subtle': 'var(--shadow-glow-subtle)',
				'glow-elegant': 'var(--shadow-glow-elegant)',
				'cosmic': 'var(--shadow-cosmic)',
				'glow-primary': 'var(--glow-primary)',
				'glow-accent': 'var(--glow-accent)'
			},
			fontFamily: {
				sans: ['Inter var', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
				mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace']
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			keyframes: {
				'accordion-down': {
					from: {
						height: '0'
					},
					to: {
						height: 'var(--radix-accordion-content-height)'
					}
				},
				'accordion-up': {
					from: {
						height: 'var(--radix-accordion-content-height)'
					},
					to: {
						height: '0'
					}
				},
				'starfield': {
					'0%': { transform: 'translateY(0)' },
					'100%': { transform: 'translateY(-100vh)' }
				},
				'glow-pulse': {
					'0%, 100%': { boxShadow: 'var(--glow-primary)' },
					'50%': { boxShadow: 'var(--glow-accent)' }
				},
				'float': {
					'0%, 100%': { transform: 'translateY(0px)' },
					'50%': { transform: 'translateY(-10px)' }
				},
				// The marquee row is rendered twice, so translating by exactly
				// -50% loops seamlessly.
				'marquee': {
					from: { transform: 'translateX(0)' },
					to: { transform: 'translateX(-50%)' }
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'starfield': 'starfield 20s linear infinite',
				'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
				'float': 'float 3s ease-in-out infinite',
				'marquee': 'marquee 60s linear infinite'
			}
		}
	},
	plugins: [require("tailwindcss-animate")],
} satisfies Config;
