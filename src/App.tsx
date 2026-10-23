import {StoreProvider} from './store';
import {IntlRoot} from './ui/IntlRoot';
import {LoaderProvider} from './ui/loader';
import {Shell} from './ui/Shell';

export function App() {
  return (
    <StoreProvider>
      <IntlRoot>
        <LoaderProvider>
          <Shell />
        </LoaderProvider>
      </IntlRoot>
    </StoreProvider>
  );
}
