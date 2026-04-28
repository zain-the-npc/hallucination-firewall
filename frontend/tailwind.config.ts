import type { Config } from 'tailwindcss'

const config: Config = {
    content: [
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    darkMode: "class",
    theme: {
        extend: {
            colors: {
                "on-tertiary": "#1b1c1c",
                "surface-container": "#201f1f",
                "outline": "#919191",
                "on-secondary-fixed": "#1a1c1c",
                "secondary-fixed": "#c7c6c6",
                "surface-container-low": "#1c1b1b",
                "error-container": "#93000a",
                "surface-dim": "#050608",
                "on-surface": "#e5e2e1",
                "surface-variant": "#353534",
                "on-secondary-fixed-variant": "#3a3c3c",
                "on-tertiary-fixed": "#ffffff",
                "surface-container-high": "#2a2a2a",
                "primary": "#ffffff",
                "error": "#ffb4ab",
                "on-primary-container": "#000000",
                "on-secondary-container": "#e3e2e2",
                "primary-fixed": "#5d5f5f",
                "surface-bright": "#3a3939",
                "on-primary-fixed": "#ffffff",
                "primary-container": "#d4d4d4",
                "inverse-primary": "#5d5f5f",
                "on-error-container": "#ffdad6",
                "surface-container-lowest": "#0e0e0e",
                "on-surface-variant": "#c6c6c6",
                "on-primary-fixed-variant": "#e2e2e2",
                "tertiary-fixed-dim": "#474747",
                "on-background": "#e5e2e1",
                "tertiary-container": "#929090",
                "secondary-container": "#464747",
                "primary-fixed-dim": "#454747",
                "on-secondary": "#1a1c1c",
                "surface": "#080A0E",
                "inverse-on-surface": "#313030",
                "on-primary": "#1a1c1c",
                "inverse-surface": "#e5e2e1",
                "secondary": "#c7c6c6",
                "secondary-fixed-dim": "#ababab",
                "on-tertiary-fixed-variant": "#e4e2e1",
                "tertiary-fixed": "#5f5e5e",
                "background": "#050608",
                "tertiary": "#e4e2e1",
                "surface-container-highest": "#353534",
                "on-tertiary-container": "#000000",
                "outline-variant": "#474747",
                "surface-tint": "#c6c6c7",
                "on-error": "#690005"
            },
            fontFamily: {
                "headline": ["Inter", "sans-serif"],
                "body": ["Inter", "sans-serif"],
                "label": ["Inter", "sans-serif"]
            }
        },
    },
    plugins: [],
}

export default config;