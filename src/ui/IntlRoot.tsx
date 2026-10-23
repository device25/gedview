import type {ReactNode} from 'react';
import {I18nProvider} from 'react-aria-components';
import {IntlProvider} from 'react-intl';
import {FALLBACK_LANG, messagesFor} from '../i18n';
import {useAppState} from '../store';

const quiet = () => {};

export function IntlRoot({children}: {children: ReactNode}) {
  const {lang} = useAppState();
  return (
    <IntlProvider
      locale={lang}
      defaultLocale={FALLBACK_LANG}
      messages={messagesFor(lang)}
      onError={quiet}
    >
      <I18nProvider locale={lang}>{children}</I18nProvider>
    </IntlProvider>
  );
}
