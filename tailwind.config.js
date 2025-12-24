/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: "#2cb696",
                background: "#ffffff",
                text: "#333333",
                muted: "#f0f0f0",
            }
        },
    },
    plugins: [],
}
