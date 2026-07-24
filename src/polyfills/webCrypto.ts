import * as ExpoCrypto from 'expo-crypto';

type CryptoLike = {
  getRandomValues: typeof ExpoCrypto.getRandomValues;
  randomUUID: () => string;
};

const root = globalThis as unknown as { crypto?: Partial<CryptoLike> };

if (!root.crypto) {
  Object.defineProperty(root, 'crypto', {
    configurable: true,
    value: {
      getRandomValues: <T extends Parameters<typeof ExpoCrypto.getRandomValues>[0]>(array: T) =>
        ExpoCrypto.getRandomValues(array),
      randomUUID: () => ExpoCrypto.randomUUID(),
    },
  });
} else {
  if (typeof root.crypto.getRandomValues !== 'function') {
    root.crypto.getRandomValues = <T extends Parameters<typeof ExpoCrypto.getRandomValues>[0]>(array: T) =>
      ExpoCrypto.getRandomValues(array);
  }
  if (typeof root.crypto.randomUUID !== 'function') {
    root.crypto.randomUUID = () => ExpoCrypto.randomUUID();
  }
}
