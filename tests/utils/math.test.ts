import { sum } from '../../src/utils/math';
describe('Math Utility', () => {
  describe('sum function', () => {
    it('should return 5 for sum(2, 3)', () => expect(sum(2, 3)).toBe(5));
  });
});
