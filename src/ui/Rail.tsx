import {Button} from 'react-aria-components';
import {useIntl} from 'react-intl';
import {languages} from '../i18n';
import {useAppState, useDispatch, useResolvedTheme} from '../store';
import {Flyout} from './Flyout';
import {Icon, Logo, type IconName} from './icons';
import {Tip} from './Tip';
import {
  ExportPanel,
  LanguagePanel,
  PeoplePanel,
  SettingsPanel,
  SourcesPanel,
} from './panels';
import './rail.css';

/** Left icon rail on desktop. */
export function Rail() {
  const {flyout, tree, lang} = useAppState();
  const dispatch = useDispatch();
  const intl = useIntl();
  const resolved = useResolvedTheme();
  const t = (id: string) => intl.formatMessage({id});
  const noTree = !tree;
  const short =
    languages.find((l) => l.code === lang)?.short ?? lang.toUpperCase();

  const needsTree = t('nav.needsTree');

  // Unavailable items stay focusable (aria-disabled) so their tooltip can
  // explain why; react-aria's isDisabled would suppress hover and focus.
  const railButton = (
    id: string,
    icon: IconName,
    label: string,
    pressed?: boolean,
    disabled?: boolean,
    shortcut?: string,
  ) => (
    <Tip
      label={label}
      hint={disabled ? needsTree : undefined}
      shortcut={disabled ? undefined : shortcut}
    >
      <Button
        className="rail__btn"
        aria-label={label}
        aria-disabled={disabled || undefined}
        data-open={pressed || undefined}
        data-id={id}
      >
        <Icon name={icon} />
      </Button>
    </Tip>
  );

  return (
    <nav className="rail" aria-label={t('nav.label')}>
      <Logo />
      <Tip label={t('nav.chart')} hint={noTree ? needsTree : undefined}>
        <Button
          className="rail__btn"
          aria-label={t('nav.chart')}
          aria-current={flyout === null && !noTree ? 'page' : undefined}
          aria-disabled={noTree || undefined}
          data-open={(flyout === null && !noTree) || undefined}
          onPress={() => {
            if (!noTree) dispatch({type: 'closeFlyout'});
          }}
        >
          <Icon name="tree" />
        </Button>
      </Tip>
      <Flyout
        id="people"
        disabled={noTree}
        title={t('nav.people')}
        width={340}
        trigger={railButton(
          'people',
          'people',
          t('nav.people'),
          flyout === 'people',
          noTree,
          '/',
        )}
      >
        <PeoplePanel />
      </Flyout>
      <Flyout
        id="sources"
        disabled={noTree}
        title={t('nav.sources')}
        width={340}
        trigger={railButton(
          'sources',
          'sources',
          t('nav.sources'),
          flyout === 'sources',
          noTree,
        )}
      >
        <SourcesPanel />
      </Flyout>
      <Flyout
        id="export"
        disabled={noTree}
        title={t('nav.export')}
        width={280}
        trigger={railButton(
          'export',
          'export',
          t('nav.export'),
          flyout === 'export',
          noTree,
        )}
      >
        <ExportPanel />
      </Flyout>

      <div className="rail__spacer" />

      <Flyout
        id="lang"
        title={t('lang.title')}
        width={300}
        placement="right bottom"
        trigger={
          <Tip label={intl.formatMessage({id: 'nav.language'}, {lang: short})}>
            <Button
              className="rail__btn rail__btn--text"
              aria-label={intl.formatMessage(
                {id: 'nav.language'},
                {lang: short},
              )}
              data-open={flyout === 'lang' || undefined}
            >
              {short}
            </Button>
          </Tip>
        }
      >
        <LanguagePanel onPicked={() => dispatch({type: 'closeFlyout'})} />
      </Flyout>
      <Tip label={t(resolved === 'dark' ? 'nav.themeLight' : 'nav.themeDark')}>
        <Button
          className="rail__btn"
          aria-label={t(
            resolved === 'dark' ? 'nav.themeLight' : 'nav.themeDark',
          )}
          onPress={() =>
            dispatch({
              type: 'setTheme',
              theme: resolved === 'dark' ? 'light' : 'dark',
            })
          }
        >
          <Icon name={resolved === 'dark' ? 'moon' : 'sun'} />
        </Button>
      </Tip>
      <Flyout
        id="settings"
        title={t('nav.settings')}
        width={340}
        placement="right bottom"
        trigger={railButton(
          'settings',
          'settings',
          t('nav.settings'),
          flyout === 'settings',
        )}
      >
        <SettingsPanel />
      </Flyout>
    </nav>
  );
}

/** Bottom navigation on phones. */
export function MobileNav() {
  const {flyout, tree} = useAppState();
  const dispatch = useDispatch();
  const intl = useIntl();
  const t = (id: string) => intl.formatMessage({id});
  const noTree = !tree;

  const item = (
    id: string,
    icon: IconName,
    label: string,
    active: boolean,
    disabled = false,
  ) => (
    <Button
      className="tabbar__btn"
      isDisabled={disabled}
      data-active={active || undefined}
      aria-current={id === 'chart' && active ? 'page' : undefined}
      onPress={
        id === 'chart' ? () => dispatch({type: 'closeFlyout'}) : undefined
      }
    >
      <Icon name={icon} />
      <span>{label}</span>
    </Button>
  );

  return (
    <nav className="tabbar" aria-label={t('nav.label')}>
      {item('chart', 'tree', t('nav.chartShort'), flyout === null, noTree)}
      <Flyout
        id="people"
        disabled={noTree}
        title={t('nav.people')}
        trigger={item(
          'people',
          'people',
          t('nav.peopleShort'),
          flyout === 'people',
          noTree,
        )}
      >
        <PeoplePanel />
      </Flyout>
      <Flyout
        id="sources"
        disabled={noTree}
        title={t('nav.sources')}
        trigger={item(
          'sources',
          'sources',
          t('nav.sources'),
          flyout === 'sources',
          noTree,
        )}
      >
        <SourcesPanel />
      </Flyout>
      <Flyout
        id="settings"
        title={t('nav.settings')}
        trigger={item(
          'settings',
          'settings',
          t('nav.settings'),
          flyout === 'settings',
        )}
      >
        <SettingsPanel mobileExtras />
      </Flyout>
    </nav>
  );
}
