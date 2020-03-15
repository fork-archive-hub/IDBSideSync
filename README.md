`simple-crdt` is a JavaScript library that manages the creation, indexing, and syncing of CRDT _messages_ across peers. Each peer can apply these messages to a local data store, in effect, creating a _distributed_ data store that is kept in sync without conflict--a CRDT. `simple-crdt` allows you to choose/implement whatever mechanism you want to use for the actual underlying storage (e.g., in-memory objects, SQLite, IndexedDB, etc.).

`simple-crdt` was forked from [James Long](https://twitter.com/jlongster)'s an [crdt-example-app](https://github.com/jlongster/crdt-example-app); most of the code should be considered a re-organized and (in some cases) modified version of his work.