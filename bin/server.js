const { EchoChamberHalls, WebSocketServer } = require('echo-chamber');
const webpack = require('webpack');
const WebpackDevServer = require('webpack-dev-server');
const webpackConfig = require('../webpack.config');

new WebSocketServer()
	.addHandler(new EchoChamberHalls('/', [], {
		MAX_QUEUE_ITEMS: 0,
		MAX_QUEUE_DATA: 0,
		HEADERS_MAX_LENGTH: 16,
		CHAMBER_MAX_CONNECTIONS: 2,
		MAX_CHAMBERS: 512,
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
