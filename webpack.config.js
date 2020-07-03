const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

const echoChamberHost = process.env.ECHO_HOST || 'ws://localhost:8081';

module.exports = {
	entry: './src/index.js',
	output: {
		path: path.join(__dirname, 'build'),
		filename: '[name].[contenthash].js'
	},
	node: false,
	module: {
		rules: [
			{
				test: /\.css$/i,
				use: [
					{ loader: 'style-loader', options: { injectType: 'linkTag' } },
					'file-loader',
				],
			},
		],
	},
	plugins: [
		new CleanWebpackPlugin(),
		new webpack.DefinePlugin({ 'process.env.ECHO_HOST': JSON.stringify(echoChamberHost) }),
		new HtmlWebpackPlugin({
			title: 'Chat',
			favicon: './src/favicon.png',
			meta: {
				'Content-Security-Policy': {
					'http-equiv': 'Content-Security-Policy',
					'content': [
						"base-uri 'self'",
						"default-src 'self'",
						"object-src 'none'",
						"script-src 'self'",
						"style-src 'self'",
						"font-src 'self'",
						`connect-src 'self' ${echoChamberHost}`,
						"img-src 'self' blob:",
						"form-action 'none'",
					].join('; '),
				},
			},
		}),
	]
};
