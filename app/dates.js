'use strict';

(() => {
  function localDate(date = new Date()) {
    return [
      String(date.getFullYear()).padStart(4, '0'),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  }

  const dateObject = value => new Date(value + 'T12:00:00');

  function shiftDay(value, offset) {
    const day = dateObject(value);
    day.setDate(day.getDate() + offset);
    return localDate(day);
  }

  function shiftMonth(value, offset, anchor = Number(value.slice(-2))) {
    const day = dateObject(value);
    day.setDate(1);
    day.setMonth(day.getMonth() + offset + 1, 0);
    day.setDate(Math.min(day.getDate(), anchor));
    return localDate(day);
  }

  function nextDate(value, interval, anchor) {
    if (interval === 'monthly') return shiftMonth(value, 1, anchor);
    if (interval === 'weekly') return shiftDay(value, 7);
    if (interval === 'weekdays') {
      const weekday = dateObject(value).getDay();
      return shiftDay(value, weekday === 5 ? 3 : weekday === 6 ? 2 : 1);
    }
    return shiftDay(value, 1);
  }

  const monday = value => shiftDay(value, -((dateObject(value).getDay() + 6) % 7));
  const week = value => Array.from({ length: 7 }, (_, i) => shiftDay(monday(value), i));
  const scheduled = (habit, value) =>
    habit.frequency !== 'days' || habit.weekdays.includes(dateObject(value).getDay());

  function habitStreak(habit, now = localDate()) {
    const checks = new Set(habit.checks);
    let cursor = now;
    let count = 0;
    if (habit.frequency === 'weekly') {
      const meetsTarget = date => week(date).filter(d => d <= now && checks.has(d)).length >= habit.targetPerWeek;
      if (!meetsTarget(cursor)) cursor = shiftDay(cursor, -7);
      while (meetsTarget(cursor)) {
        count++;
        cursor = shiftDay(cursor, -7);
      }
      return count;
    }
    while (!scheduled(habit, cursor)) cursor = shiftDay(cursor, -1);
    if (cursor === now && !checks.has(cursor)) cursor = shiftDay(cursor, -1);
    while (true) {
      while (!scheduled(habit, cursor)) cursor = shiftDay(cursor, -1);
      if (!checks.has(cursor)) return count;
      count++;
      cursor = shiftDay(cursor, -1);
    }
  }

  const dates = { localDate, dateObject, shiftDay, shiftMonth, nextDate, monday, week, scheduled, habitStreak };
  if (typeof module === 'object') module.exports = dates;
  else window.orbitaDates = dates;
})();
