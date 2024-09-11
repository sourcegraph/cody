module.exports = {
    syntax: 'postcss-scss',
    plugins: {
        'postcss-nested': {},
        tailwindcss: __dirname + '/tailwind.config.mjs',
    },
}
