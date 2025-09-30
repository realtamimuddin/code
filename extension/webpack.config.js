const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
  entry: {
    'content/index': './src/content/index.ts',
    'background/index': './src/background/index.ts',
    'popup/index': './src/popup/index.tsx',
    'options/index': './src/popup/options.tsx'
  },
  
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: '[name].js',
    clean: true
  },
  
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader',
          'postcss-loader'
        ]
      }
    ]
  },
  
  resolve: {
    extensions: ['.tsx', '.ts', '.js']
  },
  
  plugins: [
    new MiniCssExtractPlugin({
      filename: '[name].css'
    }),
    
    new HtmlWebpackPlugin({
      template: './public/popup.html',
      filename: 'popup/index.html',
      chunks: ['popup/index']
    }),
    
    new HtmlWebpackPlugin({
      template: './public/options.html',
      filename: 'options/index.html',
      chunks: ['options/index']
    }),
    
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'public/icons', to: 'icons' },
        { from: 'src/content/styles.css', to: 'content/styles.css' }
      ]
    })
  ]
};