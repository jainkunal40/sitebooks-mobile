const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const config = getDefaultConfig(projectRoot)

// This app lives inside a repository whose root also has node_modules (the
// Next.js web app). Two things matter:
//
//  1. Keep normal hierarchical resolution so packages can find their own nested
//     dependencies (expo/* ships some of them that way).
//  2. Pin the core React packages to THIS project's copies, otherwise a package
//     resolved from the parent tree can load a second React and break hooks.
config.watchFolders = [projectRoot]
config.resolver.extraNodeModules = {
  react: path.resolve(projectRoot, 'node_modules/react'),
  'react-dom': path.resolve(projectRoot, 'node_modules/react-dom'),
  'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
  'react-native-safe-area-context': path.resolve(
    projectRoot,
    'node_modules/react-native-safe-area-context'
  ),
  'react-native-screens': path.resolve(projectRoot, 'node_modules/react-native-screens'),
}

module.exports = config
