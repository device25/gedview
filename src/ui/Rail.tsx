import {Button} from 'react-aria-components';
import {useIntl} from 'react-intl';
import {languages} from '../i18n';
import {useAppState, useDispatch, useResolvedTheme} from '../store';
import {Flyout} from './Flyout';
import {Icon, Logo, type IconName} from './icons';
import {Tip} from './Tip';
import {MAP_ENABLED} from '../features';
import {
  ExportPanel,
  LanguagePanel,
  PeoplePanel,
  SettingsPanel,
  SourcesPanel,
} from './panels';
import './rail.css';

/** A rail button is 14px wider than its pill on each side, so a tooltip
 *  sits 14px closer to keep its usual 10px distance from the pill. */
const RAIL_TIP_OFFSET = -4;

const MODES = (['chart', 'summary', 'map'] as const).filter(
  (m) => m !== 'map' || MAP_ENABLED,
);

const isMode = (id: string): id is (typeof MODES)[number] =>
  (MODES as readonly string[]).includes(id);

/** Left icon rail on desktop. */
export function Rail() {
  const state = useAppState();
  const {flyout, tree, lang} = state;
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
      offset={RAIL_TIP_OFFSET}
    >
      <Button
        className="rail__btn"
        aria-label={label}
        aria-disabled={disabled || undefined}
        data-open={pressed || undefined}
        data-id={id}
      >
        <span className="rail__pill">
          <Icon name={icon} />
        </span>
      </Button>
    </Tip>
  );

  return (
    <nav className="rail" aria-label={t('nav.label')}>
      <Logo />
      {MODES.map((mode) => {
        const current = !noTree && flyout === null && state.mode === mode;
        const label = t(`nav.${mode}`);
        return (
          <Tip
            key={mode}
            label={label}
            hint={noTree ? needsTree : undefined}
            offset={RAIL_TIP_OFFSET}
          >
            <Button
              className="rail__btn"
              aria-label={label}
              aria-current={current ? 'page' : undefined}
              aria-disabled={noTree || undefined}
              data-open={current || undefined}
              onPress={() => {
                if (!noTree) dispatch({type: 'setMode', mode});
              }}
            >
              <span className="rail__pill">
                <Icon name={mode === 'chart' ? 'tree' : mode} />
              </span>
            </Button>
          </Tip>
        );
      })}
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
          <Tip
            label={intl.formatMessage({id: 'nav.language'}, {lang: short})}
            offset={RAIL_TIP_OFFSET}
          >
            <Button
              className="rail__btn rail__btn--text"
              aria-label={intl.formatMessage(
                {id: 'nav.language'},
                {lang: short},
              )}
              data-open={flyout === 'lang' || undefined}
            >
              <span className="rail__pill">{short}</span>
            </Button>
          </Tip>
        }
      >
        <LanguagePanel onPicked={() => dispatch({type: 'closeFlyout'})} />
      </Flyout>
      <Tip
        label={t(resolved === 'dark' ? 'nav.themeLight' : 'nav.themeDark')}
        offset={RAIL_TIP_OFFSET}
      >
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
          <span className="rail__pill">
            <Icon name={resolved === 'dark' ? 'moon' : 'sun'} />
          </span>
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
  const {flyout, tree, mode} = useAppState();
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
      aria-current={isMode(id) && active ? 'page' : undefined}
      onPress={
        isMode(id) ? () => dispatch({type: 'setMode', mode: id}) : undefined
      }
    >
      <Icon name={icon} />
      <span>{label}</span>
    </Button>
  );

  return (
    <nav className="tabbar" aria-label={t('nav.label')}>
      {item(
        'chart',
        'tree',
        t('nav.chartShort'),
        flyout === null && mode === 'chart',
        noTree,
      )}
      {item(
        'summary',
        'summary',
        t('nav.summary'),
        flyout === null && mode === 'summary',
        noTree,
      )}
      {MAP_ENABLED &&
        item(
          'map',
          'map',
          t('nav.map'),
          flyout === null && mode === 'map',
          noTree,
        )}
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
