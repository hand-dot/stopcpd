#!/usr/bin/env node

const chokidar = require('chokidar');
const { detectClones } = require('jscpd');
const notifier = require('node-notifier');
const { open } = require("openurl");
const path = require('path');

const args = process.argv.slice(2);

const dir = args[0] ? path.resolve(args[0]) : path.resolve('.')
const ignorePatterns = ['**/node_modules/**', '**/build/**', '**/dist/**', '**/coverage/**', '**/public/**'];

const chokidarOptions = {
    ignored: ignorePatterns,
    persistent: true,
    ignoreInitial: true,
};

const jscpdOptions = {
    path: [dir],
    pattern: '**/src/**/*.{js,jsx,ts,tsx}',
    gitignore: true,
    ignore: ignorePatterns,
    minTokens: 25,
    minLines: 3,
};

const getCloneId = (clone) => {
    const { sourceId, start } = clone.duplicationA;
    return `${sourceId}:${start.line}`;
};

const notify = (title, message) => {
    notifier.notify({ title, message });
};

let lastClones = [];

const initialize = async () => {
    lastClones = await detectClones(jscpdOptions);
    const message = lastClones.length ? `You already have ${lastClones.length} duplicated code` : 'You have no duplicated code';
    notify('[stopcpd]: ℹ️ stopcpd has been initialized', message);
};

const handleFileChange = async (path) => {
    console.log(`[stopcpd]: File changed: ${path}`);
    const newClones = await detectClones(jscpdOptions);

    if (newClones.length === lastClones.length) return;

    if (newClones.length < lastClones.length) {
        handleDeletedClones(newClones);
    } else {
        handleNewClones(newClones, path);
    }
};

const handleDeletedClones = (newClones) => {
    const deletedClone = lastClones.find(clone => !newClones.includes(clone));
    if (deletedClone) {
        const { duplicationA, duplicationB } = deletedClone;
        notifyDeletedClone(duplicationA, duplicationB);
        lastClones = newClones;
    }
};

const notifyDeletedClone = (a, b) => {
    const message = `${formatClonePosition(a)}\n${formatClonePosition(b)}`;
    notify('[stopcpd]: ✅ Duplicated code has been deleted', message);
};

const handleNewClones = (newClones, path) => {
    const clonesToNotify = newClones.filter(clone => !lastClones.some(lastClone => getCloneId(lastClone) === getCloneId(clone)));
    clonesToNotify.forEach(clone => {
        notifyNewClone(clone, path);
        lastClones = newClones;
    });
};

const notifyNewClone = (clone, path) => {
    const { duplicationA, duplicationB } = clone;
    const message = `${formatClonePosition(duplicationA)}\n    ${formatClonePosition(duplicationB)}`;
    notify('[stopcpd]: ⛔ Duplicated code has been newly detected', message);
    setupNotifierListener(duplicationA, duplicationB, path);
};

const formatClonePosition = ({ sourceId, start, end }) => `${sourceId}:${start.line}~${end.line}`;

const setupNotifierListener = (a, b, path) => {
    notifier.addListener('click', () => {
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


initialize();
chokidar.watch(dir, chokidarOptions).on('change', handleFileChange);
