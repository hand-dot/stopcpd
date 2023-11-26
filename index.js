#!/usr/bin/env node
const chokidar = require('chokidar');
const { detectClones } = require('jscpd');
const notifier = require('node-notifier');
const { open } = require("openurl");
const path = require('path');

const args = process.argv.slice(2);

const dir = args[0] ? path.resolve(args[0]) : path.resolve('.')
const ignorePatterns = ['**/node_modules/**', '**/build/**', '**/dist/**', '**/coverage/**'];

const chokidarOptions = {
    ignored: ignorePatterns,
    persistent: true,
    ignoreInitial: true,
};

const jscpdOptions = {
    path: [dir],
    gitignore: true,
    silent: true,
    ignore: ignorePatterns,
    minLines: 2,
    minTokens: 25,
};

/**
 * @type {IClone[]}
 */
let clones = [];
let initialCloneLength = 0;
const setInitialClones = async () => {
    clones = await detectClones({ ...jscpdOptions, silent: false });
    console.log('---------- Initial Clones ----------');
    console.log('Current clones: ', clones.length);
    console.log('------------------------------------');
    notifier.notify({
        title: '[stopcpd]: 🚀 Initial clones have been detected',
        message: `Current clones: ${clones.length}`
    });
    initialCloneLength = clones.length;
};

const handleFileChange = async (path) => {
    console.log(`File ${path} has been changed`);
    const newClones = await detectClones(jscpdOptions);

    const addedClones = newClones
        .filter(clone => clone.duplicationA.sourceId === path || clone.duplicationB.sourceId === path)
        .filter(clone => !clones.find(c => c.duplicationA.fragment === clone.duplicationA.fragment));

    console.log('---------- Added Clones ----------');
    console.log(addedClones);
    console.log('length: ', addedClones.length);
    console.log('------------------------------------');
    console.log('---------- Current Clones ----------');
    console.log('Current clones: ', `${newClones.length} (From initial clones: ${newClones.length - initialCloneLength >= 0 ? '+' : ''} ${newClones.length - initialCloneLength})`);
    console.log('------------------------------------');

    addedClones.forEach(clone => {
        const { duplicationA, duplicationB } = clone;
        const title = '[stopcpd]: ⛔ Duplicated code has been newly detected';
        const message = `${formatClonePosition(duplicationA)}\n    ${formatClonePosition(duplicationB)}`;
        notifier.notify({ title, message });
        setupNotifierListener(duplicationA, duplicationB, path);
    });

    result = newClones;

};

const formatClonePosition = ({ sourceId, start, end }) => `${sourceId}:${start.line}~${end.line}`;

const setupNotifierListener = (a, b, path) => {
    notifier.on('click', () => {
        openCloneInEditor(a, b, path);
        notifier.removeAllListeners('click');
    });
};

const openCloneInEditor = (a, b, path) => {
    if (a.sourceId === b.sourceId) {
        open(`vscode://file/${a.sourceId}:${a.start.line}`);
    } else if (a.sourceId === path) {
        open(`vscode://file/${b.sourceId}:${b.start.line}`);
    } else if (b.sourceId === path) {
        open(`vscode://file/${a.sourceId}:${a.start.line}`);
    }
};


(async () => {
    await setInitialClones();
    chokidar.watch(dir, chokidarOptions).on('change', handleFileChange);
    console.log(`Watching ${dir} for changes...`);
})()