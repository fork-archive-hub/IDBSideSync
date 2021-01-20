import * as IDBSideSync from '../../src/index';
import {
  clearDb,
  getDb,
  onSuccess,
  TODO_ITEMS_STORE,
  ARR_KEYPATH_STORE,
  resolveOnTxComplete,
  throwOnReqError,
  NO_KEYPATH_STORE,
  assertEntries,
} from './utils';

const defaultTodoItem: TodoItem = { id: 1, name: 'buy cookies', done: false };

context('IDBObjectStoreProxy', () => {
  beforeEach(async () => {
    await clearDb();
    const db = await getDb();
    await IDBSideSync.init(db);
  });

  describe('store.add() proxy', () => {
    it(`works with single-value keyPath`, async () => {
      const key = 1;
      const expectedTodo: TodoItem = { id: key, name: 'buy cookies', done: false };
      let foundTodo;
      let foundEntries;

      await transaction([TODO_ITEMS_STORE], (proxiedStore) => {
        proxiedStore.add(expectedTodo);
      });

      await transaction([TODO_ITEMS_STORE], async (proxiedStore, oplogStore) => {
        foundTodo = await onSuccess(proxiedStore.get(key));
        foundEntries = await onSuccess(oplogStore.getAll());
      });

      expect(foundTodo).to.deep.equal(expectedTodo);

      let previousHlcTime = '';
      foundEntries.forEach((entry: OpLogEntry) => {
        assert(entry.hlcTime > previousHlcTime, `each OpLogEntry's .hlcTime is greater than the previous time`);
        previousHlcTime = entry.hlcTime;
      });

      const sharedWhere = { store: TODO_ITEMS_STORE, objectKey: key };
      assertEntries(foundEntries, { hasCount: 1, where: { ...sharedWhere, prop: 'id', value: expectedTodo.id } });
      assertEntries(foundEntries, { hasCount: 1, where: { ...sharedWhere, prop: 'name', value: expectedTodo.name } });
      assertEntries(foundEntries, { hasCount: 1, where: { ...sharedWhere, prop: 'done', value: expectedTodo.done } });
    });

    it(`works with array keyPath`, async () => {
      let foundSetting;
      let foundEntries;
      const key = ['foo', 'bar'];
      const expected: ScopedSetting = { scope: 'foo', name: 'bar', value: 'baz' };

      await transaction([ARR_KEYPATH_STORE], (proxiedStore) => {
        proxiedStore.add(expected);
      });

      await transaction([ARR_KEYPATH_STORE], async (store, oplogStore) => {
        foundSetting = await onSuccess(store.get(key));
        foundEntries = await onSuccess(oplogStore.getAll());
      });

      expect(foundSetting).to.deep.equal(expected);

      foundEntries.forEach((entry: OpLogEntry) => {
        expect(entry.objectKey).to.deep.equal([foundSetting.scope, foundSetting.name]);
      });

      const sharedWhere = { store: ARR_KEYPATH_STORE, objectKey: key };
      assertEntries(foundEntries, { hasCount: 1, where: { ...sharedWhere, prop: 'scope', value: expected.scope } });
      assertEntries(foundEntries, { hasCount: 1, where: { ...sharedWhere, prop: 'name', value: expected.name } });
      assertEntries(foundEntries, { hasCount: 1, where: { ...sharedWhere, prop: 'value', value: expected.value } });
    });

    it(`works without a keyPath`, async () => {
      const key = 'foo';
      const initialValue = 'bar';
      let foundValue;
      let foundEntries;

      await transaction([NO_KEYPATH_STORE], (proxiedStore) => {
        proxiedStore.add(initialValue, key);
      });

      await transaction([NO_KEYPATH_STORE], async (store, oplogStore) => {
        foundValue = await onSuccess(store.get(key));
        foundEntries = await onSuccess(oplogStore.getAll());
      });

      // Verify that we found the initial value...
      expect(foundValue).to.deep.equal(initialValue);

      let previousHlcTime = '';
      foundEntries.forEach((entry: OpLogEntry) => {
        assert(entry.hlcTime > previousHlcTime, `each OpLogEntry's .hlcTime is greater than the previous time`);
        previousHlcTime = entry.hlcTime;
      });

      const sharedWhere = { store: NO_KEYPATH_STORE, objectKey: key, prop: '' };
      assertEntries(foundEntries, { hasCount: 1, where: { ...sharedWhere, value: initialValue } });
    });

    it(`aborts transaction w/error when called on store without keyPath if no "key" param specified`, async () => {
      try {
        await transaction([TODO_ITEMS_STORE, NO_KEYPATH_STORE], (todoItemsStore, noKeypathStore) => {
          // Do more than one thing in the transaction... First add a thing to a store.
          expect(() => todoItemsStore.add(defaultTodoItem)).to.not.throw();

          // Then call put() without the key param, which should throw an error and abort the entire transaction.
          expect(() => noKeypathStore.add('foo')).to.throw('specify the "key" param');
        });
      } catch (error) {
        expect(error.message).to.contain('transaction was aborted');
      }

      let todoItems;
      let noKeyPathItems;
      let oplogItems;

      await transaction([TODO_ITEMS_STORE, NO_KEYPATH_STORE], async (todoStore, noKeypathStore, oplogStore) => {
        todoItems = await onSuccess(todoStore.getAll());
        noKeyPathItems = await onSuccess(noKeypathStore.getAll());
        oplogItems = await onSuccess(oplogStore.getAll());
      });

      // Verify that the entire transaction was rolled back and no objects were saved to any store
      expect(todoItems).to.have.length(0);
      expect(noKeyPathItems).to.have.length(0);
      expect(oplogItems).to.have.length(0);
    });
  });

  describe('store.put() proxy', () => {
    it(`works with single-value keyPath`, async () => {
      const key = 1;
      let foundTodo;
      let foundEntries;
      const initialTodo: TodoItem = { id: key, name: 'buy cookies', done: false };
      const change: Partial<TodoItem> = { done: true };
      const finalTodo: TodoItem = { ...initialTodo, ...change };

      await transaction([TODO_ITEMS_STORE], async (proxiedStore) => {
        throwOnReqError(proxiedStore.put(initialTodo));
      });

      await transaction([TODO_ITEMS_STORE], (proxiedStore) => {
        throwOnReqError(proxiedStore.put(change, key));
      });

      await transaction([TODO_ITEMS_STORE], async (proxiedStore, oplogStore) => {
        foundTodo = await onSuccess(proxiedStore.get(finalTodo.id));
        foundEntries = await onSuccess(oplogStore.getAll());
      });

      expect(foundTodo).to.deep.equal(finalTodo);

      let previousHlcTime = '';
      foundEntries.forEach((entry: OpLogEntry) => {
        assert(entry.hlcTime > previousHlcTime, `each OpLogEntry's .hlcTime is greater than the previous time`);
        previousHlcTime = entry.hlcTime;
      });

      const sharedWhere = { store: TODO_ITEMS_STORE, objectKey: key };
      assertEntries(foundEntries, { hasCount: 1, where: { ...sharedWhere, prop: 'id', value: initialTodo.id } });
      assertEntries(foundEntries, { hasCount: 1, where: { ...sharedWhere, prop: 'name', value: initialTodo.name } });
      assertEntries(foundEntries, { hasCount: 1, where: { ...sharedWhere, prop: 'done', value: initialTodo.done } });
      assertEntries(foundEntries, { hasCount: 1, where: { ...sharedWhere, prop: 'done', value: finalTodo.done } });
    });

    it(`works with array keyPath`, async () => {
      const initial: ScopedSetting = { scope: 'foo', name: 'bar', value: 'baz' };
      const key = [initial.scope, initial.name];
      const change: Partial<ScopedSetting> = { value: 'boo' };
      const final = { ...initial, ...change };

      let foundSetting;
      let foundEntries;

      await transaction([ARR_KEYPATH_STORE], (proxiedStore) => {
        proxiedStore.put(initial);
      });

      await transaction([ARR_KEYPATH_STORE], (proxiedStore) => {
        proxiedStore.put(change, key);
      });

      await transaction([ARR_KEYPATH_STORE], async (store, oplogStore) => {
        foundSetting = await onSuccess(store.get(key));
        foundEntries = await onSuccess(oplogStore.getAll());
      });

      expect(foundSetting).to.deep.equal(final);

      foundEntries.forEach((entry: OpLogEntry) => {
        expect(entry.objectKey).to.deep.equal([foundSetting.scope, foundSetting.name]);
      });

      const sharedWhere = { store: ARR_KEYPATH_STORE, objectKey: key };
      assertEntries(foundEntries, { hasCount: 1, where: { ...sharedWhere, prop: 'scope', value: initial.scope } });
      assertEntries(foundEntries, { hasCount: 1, where: { ...sharedWhere, prop: 'name', value: initial.name } });
      assertEntries(foundEntries, { hasCount: 1, where: { ...sharedWhere, prop: 'value', value: initial.value } });
      assertEntries(foundEntries, { hasCount: 1, where: { ...sharedWhere, prop: 'value', value: final.value } });
    });

    it(`works without a keyPath`, async () => {
      const key = 'foo';
      const initialValue = 'bar';
      const finalValue = 8675309;
      let foundValue;
      let foundEntries;

      // Add the initial value to the store...
      await transaction([NO_KEYPATH_STORE], (proxiedStore) => {
        proxiedStore.put(initialValue, key);
      });

      // Read the initial value back from the store...
      await transaction([NO_KEYPATH_STORE], async (store) => {
        foundValue = await onSuccess(store.get(key));
      });

      // Verify that we found the initial value...
      expect(foundValue).to.deep.equal(initialValue);

      // Update the value...
      await transaction([NO_KEYPATH_STORE], (proxiedStore) => {
        proxiedStore.put(finalValue, key);
      });

      // Read it back out...
      await transaction([NO_KEYPATH_STORE], async (store) => {
        foundValue = await onSuccess(store.get(key));
      });

      // Verify that it has the expected value...
      expect(foundValue).to.deep.equal(finalValue);

      // Get all the oplog entries...
      await transaction([NO_KEYPATH_STORE], async (store, oplogStore) => {
        foundEntries = await onSuccess(oplogStore.getAll());
      });

      let previousHlcTime = '';

      foundEntries.forEach((entry: OpLogEntry) => {
        assert(entry.hlcTime > previousHlcTime, `each OpLogEntry's .hlcTime is greater than the previous time`);
        previousHlcTime = entry.hlcTime;
      });

      const sharedWhere = { store: NO_KEYPATH_STORE, objectKey: key, prop: '' };
      assertEntries(foundEntries, { hasCount: 1, where: { ...sharedWhere, value: initialValue } });
      assertEntries(foundEntries, { hasCount: 1, where: { ...sharedWhere, value: finalValue } });
    });

    it(`aborts transaction w/error when called on store without keyPath if no "key" param specified`, async () => {
      try {
        await transaction([TODO_ITEMS_STORE, NO_KEYPATH_STORE], (todoItemsStore, noKeypathStore) => {
          // Do more than one thing in the transaction... First add a thing to a store.
          expect(() => todoItemsStore.add(defaultTodoItem)).to.not.throw();

          // Then call put() without the key param, which should throw an error and abort the entire transaction.
          expect(() => noKeypathStore.put('foo')).to.throw('specify the "key" param');
        });
      } catch (error) {
        expect(error.message).to.contain('transaction was aborted');
      }

      let todoItems;
      let noKeyPathItems;
      let oplogItems;

      await transaction([TODO_ITEMS_STORE, NO_KEYPATH_STORE], async (todoStore, noKeypathStore, oplogStore) => {
        todoItems = await onSuccess(todoStore.getAll());
        noKeyPathItems = await onSuccess(noKeypathStore.getAll());
        oplogItems = await onSuccess(oplogStore.getAll());
      });

      // Verify that the entire transaction was rolled back and no objects were saved to any store
      expect(todoItems).to.have.length(0);
      expect(noKeyPathItems).to.have.length(0);
      expect(oplogItems).to.have.length(0);
    });
  });
});

function transaction(storeNames: string[], callback: (...stores: IDBObjectStore[]) => void) {
  return resolveOnTxComplete([IDBSideSync.OPLOG_STORE, ...storeNames], 'readwrite', (oplogStore, ...otherStores) => {
    const proxiedStores = otherStores.map((store) => IDBSideSync.proxyStore(store));
    callback(...proxiedStores, oplogStore);
  });
}
