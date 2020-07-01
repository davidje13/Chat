const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const WebpackDevServer = require('webpack-dev-server');

const webpackConfig = {
	entry: './test/index.js',
	node: false,
	plugins: [new HtmlWebpackPlugin({ title: 'Tests' })],
};

const server = new WebpackDevServer(webpack({ mode: 'none', ...webpackConfig }), {
	hot: false,
	inline: true,
	liveReload: true,
	contentBase: false,
	open: true,
	stats: 'minimal',
});

server.listen(8888, 'localhost', () => {
	process.stdout.write('Tests available at http://localhost:8888/\n');
	process.stdout.write('Press Ctrl+C to stop\n');
});

process.on('SIGINT', () => server.close());
