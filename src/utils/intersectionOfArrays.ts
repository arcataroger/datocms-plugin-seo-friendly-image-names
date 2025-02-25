export const intersectionOfArrays = <T>(arrays: T[][]): T[] =>
  arrays.reduce((acc, arr) => {
    const set = new Set(arr);
    return acc.filter((item) => set.has(item));
  }, arrays[0] || []);
