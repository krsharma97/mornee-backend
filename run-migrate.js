import migrateSizeChart from './migrate-sizechart.js';
migrateSizeChart().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });