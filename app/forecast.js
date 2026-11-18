'use strict';

(() => {
  const dates = typeof module === 'object' ? require('./dates.js') : window.orbitaDates;

  function expenseForecast(transactions, start, count) {
    const months = Array.from({ length: count }, (_, index) => ({
      month: dates.shiftMonth(start, index, 1).slice(0, 7),
      recorded: [], projected: []
    }));
    const byMonth = new Map(months.map(month => [month.month, month]));
    const last = months.at(-1)?.month;
    for (const item of transactions) {
      if (item.type !== 'expense') continue;
      byMonth.get(item.date.slice(0, 7))?.recorded.push(item);
      if (item.repeat !== 'monthly' || !last) continue;

      const [year, month] = item.date.split('-').map(Number);
      const [firstYear, firstMonth] = start.split('-').map(Number);
      const firstOffset = Math.max(1, (firstYear - year) * 12 + firstMonth - month);
      const [lastYear, lastMonth] = last.split('-').map(Number);
      const lastOffset = (lastYear - year) * 12 + lastMonth - month;
      for (let offset = firstOffset; offset <= lastOffset; offset++) {
        const date = dates.shiftMonth(item.date, offset, item.repeatDay || Number(item.date.slice(-2)));
        if (date >= start) byMonth.get(date.slice(0, 7))?.projected.push({ ...item, date });
      }
    }
    for (const month of months) {
      month.recorded.sort((a, b) => a.date.localeCompare(b.date));
      month.projected.sort((a, b) => a.date.localeCompare(b.date));
    }
    return months;
  }

  if (typeof module === 'object') module.exports = { expenseForecast };
  else window.orbitaForecast = { expenseForecast };
})();
