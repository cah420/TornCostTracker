# Manual verification

- Load the Items page with cached inventory: Quantity is initially sorted descending.
- Select each column header and select it again: the first selection is descending and the second is ascending.
- Change the sort, navigate away and back, then reload: the Items grid retains its selected column and direction.
- Search for an unmatched value: the grid displays its empty state.
- Refresh inventory: the grid displays its loading state, the refresh button is disabled, and rows/statistics update on completion.
