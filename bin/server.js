const { EchoChamberHalls, WebSocketServer } = require('websocket-echo-chamber');
const webpack = require('webpack');
const WebpackDevServer = require('webpack-dev-server');
const webpackConfig = require('../webpack.config');

new WebSocketServer()
	.addHandler(new EchoChamberHalls('/', [], {
		MAX_QUEUE_ITEMS: 1024,
		MAX_QUEUE_DATA: 16 * 1024,
		HEADERS_MAX_LENGTH: 128,
		CHAMBER_MAX_CONNECTIONS: 32,
		MAX_CHAMBERS: 64,
	}))
	.listen(8081, 'localhost');

const server = new WebpackDevServer(webpack({ mode: 'none', ...webpackConfig }), {
	hot: false,
	inline: false,
	liveReload: false,
	contentBase: false,
	stats: 'minimal',
});

server.listen(8080, 'localhost', () => {
	process.stdout.write('Available at http://localhost:8080/\n');
	process.stdout.write('Press Ctrl+C to stop\n');
});

process.on('SIGINT', () => server.close());
