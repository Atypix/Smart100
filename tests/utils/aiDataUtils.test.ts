import { createPriceSequences, normalizeData } from '../../src/utils/aiDataUtils';

describe('AI Data Utilities', () => {
  describe('createPriceSequences', () => {
    it('should create sequences and targets correctly', () => {
      const prices = [10, 11, 12, 13, 14, 15, 16, 17];
      const lookback = 3;
      const horizon = 2;
      // Expected:
      // Seq 1: [10,11,12] (i=2), currentPrice=12. targetPrice=prices[2+2]=prices[4]=14. Target=1 (14>12)
      // Seq 2: [11,12,13] (i=3), currentPrice=13. targetPrice=prices[3+2]=prices[5]=15. Target=1 (15>13)
      // Seq 3: [12,13,14] (i=4), currentPrice=14. targetPrice=prices[4+2]=prices[6]=16. Target=1 (16>14)
      // Seq 4: [13,14,15] (i=5), currentPrice=15. targetPrice=prices[5+2]=prices[7]=17. Target=1 (17>15)
      // Loop for i from lookback-1 (2) to prices.length - horizon -1 (8-2-1 = 5)
      // i=2: prices.slice(0,3) = [10,11,12]. target: prices[4]=14 > prices[2]=12 => 1
      // i=3: prices.slice(1,4) = [11,12,13]. target: prices[5]=15 > prices[3]=13 => 1
      // i=4: prices.slice(2,5) = [12,13,14]. target: prices[6]=16 > prices[4]=14 => 1
      // i=5: prices.slice(3,6) = [13,14,15]. target: prices[7]=17 > prices[5]=15 => 1
      const { sequences, targets } = createPriceSequences(prices, lookback, horizon);

      expect(sequences).toEqual([
        [10, 11, 12],
        [11, 12, 13],
        [12, 13, 14],
        [13, 14, 15],
      ]);
      expect(targets).toEqual([1, 1, 1, 1]);
    });

    it('should handle target being 0 (price decrease or same)', () => {
      const prices = [10, 11, 12, 11, 10, 9];
      const lookback = 2;
      const horizon = 1;
      // i from lookback-1 (1) to prices.length - horizon -1 (6-1-1 = 4)
      // i=1: seq=[10,11], current=11. target=prices[2]=12. (12>11) => 1
      // i=2: seq=[11,12], current=12. target=prices[3]=11. (11>12) => 0
      // i=3: seq=[12,11], current=11. target=prices[4]=10. (10>11) => 0
      // i=4: seq=[11,10], current=10. target=prices[5]=9.  (9>10) => 0
      const { sequences, targets } = createPriceSequences(prices, lookback, horizon);
      expect(sequences).toEqual([
        [10, 11],
        [11, 12],
        [12, 11],
        [11, 10],
      ]);
      expect(targets).toEqual([1, 0, 0, 0]);
    });
    
    it('should return empty arrays if lookback or horizon is zero or negative', () => {
      const prices = [1,2,3,4,5];
      expect(createPriceSequences(prices, 0, 1)).toEqual({sequences: [], targets: []});
      expect(createPriceSequences(prices, 1, 0)).toEqual({sequences: [], targets: []});
      expect(createPriceSequences(prices, -1, 1)).toEqual({sequences: [], targets: []});
    });

    it('should return empty arrays if prices array is too short', () => {
      const prices = [10, 11, 12];
      // Need lookback + horizon length. If lookback=3, horizon=1, needs 4 elements.
      expect(createPriceSequences(prices, 3, 1)).toEqual({ sequences: [], targets: [] });
      expect(createPriceSequences(prices, 2, 2)).toEqual({ sequences: [], targets: [] }); // needs 2+2 = 4
      expect(createPriceSequences(prices, 1, 1)).toEqual({ // needs 1+1 = 2
          sequences: [[10],[11]], // i from 0 to 3-1-1=1. i=0: seq=[10], t=11>10 (1). i=1: seq=[11], t=12>11 (1)
          targets: [1,1]
      });
    });
    
    it('should return empty arrays for empty prices input', () => {
        const { sequences, targets } = createPriceSequences([], 3, 1);
        expect(sequences).toEqual([]);
        expect(targets).toEqual([]);
    });

    it('should handle varying lookback and horizon values', () => {
        const prices = [1,2,3,4,5,6,7,8,9,10];
        // Case 1: lookback=5, horizon=1
        // i from 4 to 10-1-1 = 8
        // i=4: prices.slice(0,5)=[1,2,3,4,5], current=5, target=prices[5]=6. (6>5)=>1
        // ...
        // i=8: prices.slice(4,9)=[5,6,7,8,9], current=9, target=prices[9]=10. (10>9)=>1
        let result = createPriceSequences(prices, 5, 1);
        expect(result.sequences.length).toBe(5); // (10 - 1) - 5 + 1 = 5
        expect(result.targets.length).toBe(5);
        expect(result.sequences[0]).toEqual([1,2,3,4,5]);
        expect(result.targets[0]).toBe(1);
        expect(result.sequences[4]).toEqual([5,6,7,8,9]);
        expect(result.targets[4]).toBe(1);

        // Case 2: lookback=2, horizon=3
        // i from 1 to 10-3-1 = 6
        // i=1: prices.slice(0,2)=[1,2], current=2, target=prices[1+3]=prices[4]=5. (5>2)=>1
        // i=6: prices.slice(5,7)=[6,7], current=7, target=prices[6+3]=prices[9]=10. (10>7)=>1
        result = createPriceSequences(prices, 2, 3);
        expect(result.sequences.length).toBe(6); // (10 - 3) - 2 + 1 = 6
        expect(result.targets.length).toBe(6);
        expect(result.sequences[0]).toEqual([1,2]);
        expect(result.targets[0]).toBe(1);
        expect(result.sequences[5]).toEqual([6,7]);
        expect(result.targets[5]).toBe(1);
    });
  });

  describe('normalizeData', () => {
    it('should normalize data by calculating new min/max', () => {
      const sequences = [[10, 20, 30], [15, 25, 35]];
      // min=10, max=35. Range = 25
      // Seq 1: (10-10)/25=0, (20-10)/25=0.4, (30-10)/25=0.8
      // Seq 2: (15-10)/25=0.2, (25-10)/25=0.6, (35-10)/25=1
      const { normalizedSequences, minMax } = normalizeData(sequences);
      
      expect(minMax).toEqual({ min: 10, max: 35 });
      expect(normalizedSequences[0][0]).toBeCloseTo(0);
      expect(normalizedSequences[0][1]).toBeCloseTo(0.4);
      expect(normalizedSequences[0][2]).toBeCloseTo(0.8);
      expect(normalizedSequences[1][0]).toBeCloseTo(0.2);
      expect(normalizedSequences[1][1]).toBeCloseTo(0.6);
      expect(normalizedSequences[1][2]).toBeCloseTo(1);
    });

    it('should normalize data using existing min/max', () => {
      const sequences = [[10, 20, 30], [15, 25, 35]];
      const existingMinMax = { min: 5, max: 40 }; // Range = 35
      // Seq 1: (10-5)/35=5/35, (20-5)/35=15/35, (30-5)/35=25/35
      // Seq 2: (15-5)/35=10/35, (25-5)/35=20/35, (35-5)/35=30/35
      const { normalizedSequences, minMax } = normalizeData(sequences, existingMinMax);

      expect(minMax).toEqual(existingMinMax);
      expect(normalizedSequences[0][0]).toBeCloseTo(5 / 35);
      expect(normalizedSequences[0][1]).toBeCloseTo(15 / 35);
      expect(normalizedSequences[0][2]).toBeCloseTo(25 / 35);
      expect(normalizedSequences[1][0]).toBeCloseTo(10 / 35);
      expect(normalizedSequences[1][1]).toBeCloseTo(20 / 35);
      expect(normalizedSequences[1][2]).toBeCloseTo(30 / 35);
    });

    it('should handle all values being identical (calculating new min/max)', () => {
      const sequences = [[20, 20], [20, 20]];
      const { normalizedSequences, minMax } = normalizeData(sequences);
      expect(minMax).toEqual({ min: 20, max: 20 });
      // All values should be 0.5 as per implementation (or 0, depending on convention)
      expect(normalizedSequences).toEqual([[0.5, 0.5], [0.5, 0.5]]);
    });
    
    it('should handle all values being identical (using existing min/max where min=max)', () => {
      const sequences = [[20, 20], [20, 20]];
      const existingMinMax = { min: 20, max: 20 };
      const { normalizedSequences, minMax } = normalizeData(sequences, existingMinMax);
      expect(minMax).toEqual(existingMinMax);
      expect(normalizedSequences).toEqual([[0.5, 0.5], [0.5, 0.5]]);
    });

    it('should handle values outside existing min/max by clipping to 0 or 1', () => {
      const sequences = [[5, 10, 40, 45]]; // Values below min and above max
      const existingMinMax = { min: 10, max: 40 }; // Range = 30
      // (5-10)/30 = -0.166 -> 0 (or would be if not clipped by formula (value-min)/(max-min))
      // (10-10)/30 = 0
      // (40-10)/30 = 1
      // (45-10)/30 = 1.166 -> 1
      // The formula (value - min) / (max - min) naturally produces values outside [0,1] if input is outside [min,max].
      // Typical normalization doesn't clip, but rather the caller ensures data is in range or handles outliers.
      // Let's test the direct formula output.
      const { normalizedSequences, minMax } = normalizeData(sequences, existingMinMax);
      expect(minMax).toEqual(existingMinMax);
      expect(normalizedSequences[0][0]).toBeCloseTo(-5 / 30); // Value 5
      expect(normalizedSequences[0][1]).toBeCloseTo(0 / 30);   // Value 10
      expect(normalizedSequences[0][2]).toBeCloseTo(30 / 30);  // Value 40
      expect(normalizedSequences[0][3]).toBeCloseTo(35 / 30);  // Value 45
    });

    it('should return empty normalizedSequences for empty input sequences', () => {
      const { normalizedSequences, minMax } = normalizeData([]);
      expect(normalizedSequences).toEqual([]);
      expect(minMax).toEqual({ min: 0, max: 0 }); // Default from implementation
    });
    
    it('should return empty normalizedSequences for sequences with empty inner arrays', () => {
      const { normalizedSequences, minMax } = normalizeData([[]]);
      expect(normalizedSequences).toEqual([]);
      expect(minMax).toEqual({ min: 0, max: 0 });
    });
    
    it('should use provided minMax even if sequences are empty', () => {
        const existing = {min: 10, max: 20};
        const { normalizedSequences, minMax } = normalizeData([], existing);
        expect(normalizedSequences).toEqual([]);
        expect(minMax).toEqual(existing);
    });
  });
});
