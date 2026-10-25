import {useMemo, useState} from 'react';
import {
  Autocomplete,
  Button,
  Input,
  ListBox,
  ListBoxItem,
  Radio,
  RadioGroup,
  SearchField,
} from 'react-aria-components';
import {useIntl} from 'react-intl';
import type {ChartSettings, SourceView} from '../gedcom/types';
import {languages} from '../i18n';
import {useAppState, useDispatch} from '../store';
import type {ThemePref} from '../store/persist';
import {CheckField, SelectField} from './controls';
import {FileActions} from './FileActions';
import {Icon} from './icons';
import {buildIndex, searchPeople} from './search';
import {runChecks, todayJdn} from '../model/checks';
import {displayName, formatDate} from './format';
import {eventLabel} from './events';
import {listSources, sourceFacts} from './treeInfo';
import {SourceFactsLine} from './cite';
import {NoteView} from './NoteView';
import {safeHref} from './html';

export function PeoplePanel() {
  const {peopleCheck} = useAppState();
  return peopleCheck ? <CheckList /> : <PeopleSearch />;
}

/** The people a «Сводка» check is about, each with the facts involved. */
function CheckList() {
  const {tree, lang, settings, peopleCheck} = useAppState();
  const dispatch = useDispatch();
  const intl = useIntl();
  const findings = useMemo(
    () => (tree && peopleCheck ? runChecks(tree, todayJdn())[peopleCheck] : []),
    [tree, peopleCheck],
  );
  if (!tree || !peopleCheck) return null;
  const check = intl.formatMessage({id: `check.${peopleCheck}`});
  const o = {locale: lang, style: settings.dateStyle};
  return (
    <div className="check-list">
      <div className="check-list__filter">
        <span>{intl.formatMessage({id: 'people.check'}, {check})}</span>
        <Button
          className="icon-btn"
          aria-label={intl.formatMessage({id: 'people.clearCheck'}, {check})}
          onPress={() => dispatch({type: 'showCheck', check: undefined})}
        >
          <Icon name="close" size={14} strokeWidth={2.2} />
        </Button>
      </div>
      <p role="status" className="muted">
        {intl.formatMessage({id: 'people.found'}, {n: findings.length})}
      </p>
      <ListBox
        className="results"
        aria-label={check}
        items={findings.map((f) => ({...f, key: f.id}))}
        selectionMode="none"
        onAction={(key) => dispatch({type: 'select', id: String(key)})}
      >
        {(f) => {
          const name = displayName(tree.indis.get(f.id), f.id);
          const facts = f.events
            .map((e) =>
              [
                eventLabel(intl, e),
                formatDate(e.date, o),
                e.who !== f.id
                  ? `(${displayName(tree.indis.get(e.who), e.who)})`
                  : '',
              ]
                .filter(Boolean)
                .join(' '),
            )
            .join(' · ');
          return (
            <ListBoxItem id={f.id} textValue={name} className="results__item">
              <span className="results__name">{name}</span>
              {facts && <span className="results__life">{facts}</span>}
            </ListBoxItem>
          );
        }}
      </ListBox>
    </div>
  );
}

function PeopleSearch() {
  const {tree, lang, settings, selectedId} = useAppState();
  const dispatch = useDispatch();
  const intl = useIntl();
  const [query, setQuery] = useState('');
  const index = useMemo(
    () =>
      tree ? buildIndex(tree, {locale: lang, style: settings.dateStyle}) : [],
    [tree, lang, settings.dateStyle],
  );
  const results = useMemo(() => searchPeople(index, query, 50), [index, query]);

  return (
    <Autocomplete inputValue={query} onInputChange={setQuery}>
      <SearchField
        className="search"
        aria-label={intl.formatMessage({id: 'people.search'})}
        autoFocus
      >
        <Input
          className="search__input"
          placeholder={intl.formatMessage({id: 'people.searchPlaceholder'})}
        />
        <Button
          className="search__clear"
          aria-label={intl.formatMessage({id: 'people.clear'})}
        >
          <Icon name="close" size={14} strokeWidth={2.2} />
        </Button>
      </SearchField>
      <ListBox
        className="results"
        aria-label={intl.formatMessage({id: 'people.results'})}
        items={results}
        selectionMode="none"
        onAction={(key) => dispatch({type: 'select', id: String(key)})}
        renderEmptyState={() => (
          <p className="empty">{intl.formatMessage({id: 'people.empty'})}</p>
        )}
      >
        {(r) => (
          <ListBoxItem
            id={r.id}
            textValue={r.name}
            className="results__item"
            data-current={r.id === selectedId || undefined}
          >
            <span className="results__name">{r.name}</span>
            <span className="results__life">{r.life}</span>
          </ListBoxItem>
        )}
      </ListBox>
    </Autocomplete>
  );
}

export function SourcesPanel() {
  const {tree} = useAppState();
  const intl = useIntl();
  const sources = useMemo(() => (tree ? listSources(tree) : []), [tree]);
  if (!sources.length) {
    return <p className="empty">{intl.formatMessage({id: 'sources.empty'})}</p>;
  }
  return (
    <ul
      className="source-list"
      aria-label={intl.formatMessage({id: 'sources.title'})}
    >
      {sources.map((s) => (
        <SourceEntry key={s.id} id={s.id} title={s.title} />
      ))}
    </ul>
  );
}

/** A source of the file: its title, and on opening what the file says
 *  of it — author, publication, where it is kept, its text and notes. */
function SourceEntry({id, title}: {id: string; title: string}) {
  const {tree} = useAppState();
  const view = tree?.sources?.get(id);
  const facts = tree ? sourceFacts(tree, id) : undefined;
  const more =
    !!facts &&
    (!!facts.author ||
      !!facts.publication ||
      facts.kept.length > 0 ||
      !!view?.repositories.some((r) => r.address || r.websites?.length) ||
      !!view?.text ||
      (view?.notes.length ?? 0) > 0);
  if (!more) {
    return (
      <li>
        <span>{title}</span>
        <span className="source-list__id">{id}</span>
      </li>
    );
  }
  return (
    <li>
      <details className="source-list__details">
        <summary>
          <span>{title}</span>
          <span className="source-list__id">{id}</span>
        </summary>
        <div className="source-list__body">
          <SourceFactsLine facts={facts} />
          {view?.repositories.map((r, i) => (
            <ArchiveDetails key={`r${i}`} repo={r} />
          ))}
          {view?.text && <NoteView note={view.text} quote />}
          {view?.notes.map((n, i) => (
            <NoteView key={i} note={n} />
          ))}
        </div>
      </details>
    </li>
  );
}

/** Where an archive is and its site and notes, from its REPO record. */
function ArchiveDetails({repo}: {repo: SourceView['repositories'][number]}) {
  const intl = useIntl();
  if (!repo.address && !repo.websites?.length && !repo.repoNotes?.length)
    return null;
  return (
    <div className="source-list__archive">
      {repo.name && <span>{repo.name}</span>}
      {repo.address && (
        <span className="muted">
          {intl.formatMessage({id: 'source.address'}, {address: repo.address})}
        </span>
      )}
      {repo.websites?.map((w, i) => {
        const href = safeHref(w);
        return href && /^https?:/.test(href) ? (
          <a
            key={i}
            className="link"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {w.replace(/^https?:\/\//, '').replace(/\/$/, '')} ↗
          </a>
        ) : (
          <span key={i}>{w}</span>
        );
      })}
      {repo.repoNotes?.map((n, i) => (
        <NoteView key={i} note={n} />
      ))}
    </div>
  );
}

export function ExportPanel() {
  const intl = useIntl();
  return (
    <>
      <div className="export-grid">
        {['PNG', 'SVG', 'PDF'].map((f) => (
          <Button key={f} className="btn btn--block" isDisabled>
            {f}
          </Button>
        ))}
        <Button className="btn btn--block" isDisabled>
          {intl.formatMessage({id: 'export.print'})}
        </Button>
      </div>
      {/* TODO(part C): enable together with the chart. */}
      <p className="hint">{intl.formatMessage({id: 'export.soon'})}</p>
    </>
  );
}

export function LanguagePanel({onPicked}: {onPicked?: () => void}) {
  const {lang} = useAppState();
  const dispatch = useDispatch();
  const intl = useIntl();
  return (
    <>
      <RadioGroup
        className="radios"
        aria-label={intl.formatMessage({id: 'lang.title'})}
        value={lang}
        onChange={(code) => {
          dispatch({type: 'setLang', lang: code});
          onPicked?.();
        }}
      >
        {languages.map((l) => (
          <Radio key={l.code} value={l.code} className="radio">
            <span className="radio__dot" aria-hidden="true" />
            <span lang={l.code} className="radio__name">
              {l.name}
            </span>
            {l.coverage < 1 && (
              <span className="radio__note">
                {intl.formatMessage({id: 'lang.partial'})}
              </span>
            )}
          </Radio>
        ))}
      </RadioGroup>
      <p className="hint">{intl.formatMessage({id: 'lang.hint'})}</p>
    </>
  );
}

export function SettingsPanel({mobileExtras}: {mobileExtras?: boolean}) {
  const {settings, theme, tree} = useAppState();
  const dispatch = useDispatch();
  const intl = useIntl();
  const t = (id: string) => intl.formatMessage({id});
  const set = (patch: Partial<ChartSettings>) =>
    dispatch({type: 'setSettings', patch});

  return (
    <div className="settings">
      <CheckField
        isSelected={settings.sexColors}
        onChange={(v) => set({sexColors: v})}
      >
        {t('settings.sexColors')}
      </CheckField>
      <CheckField
        isSelected={settings.showIds}
        onChange={(v) => set({showIds: v})}
      >
        {t('settings.ids')}
      </CheckField>
      <CheckField
        isSelected={settings.dashChallenged}
        onChange={(v) => set({dashChallenged: v})}
      >
        {t('settings.challenged')}
      </CheckField>
      <CheckField
        isSelected={settings.hideRestricted}
        onChange={(v) => set({hideRestricted: v})}
      >
        {t('settings.hideRestricted')}
      </CheckField>
      <CheckField
        isSelected={settings.loadRemoteMedia}
        onChange={(v) => set({loadRemoteMedia: v})}
        hint={t('settings.loadRemoteMediaHint')}
      >
        {t('settings.loadRemoteMedia')}
      </CheckField>
      <SelectField
        label={t('settings.cardColor')}
        value={settings.cardColor}
        onChange={(v) => set({cardColor: v})}
        options={[
          {id: 'none', label: t('settings.cardColor.none')},
          {id: 'decade', label: t('settings.cardColor.decade')},
        ]}
      />
      <SelectField
        label={t('settings.disproven')}
        value={settings.disproven}
        onChange={(v) => set({disproven: v})}
        options={[
          {id: 'hide', label: t('settings.hide')},
          {id: 'dotted', label: t('settings.dotted')},
        ]}
      />
      <SelectField
        label={t('settings.dates')}
        value={settings.dateStyle}
        onChange={(v) => set({dateStyle: v})}
        options={[
          {id: 'source', label: t('settings.datesSource')},
          {id: 'both', label: t('settings.datesBoth')},
          {id: 'gregorian', label: t('settings.datesGregorian')},
        ]}
      />
      <SelectField<ThemePref>
        label={t('settings.theme')}
        value={theme}
        onChange={(v) => dispatch({type: 'setTheme', theme: v})}
        options={[
          {id: 'system', label: t('theme.system')},
          {id: 'light', label: t('theme.light')},
          {id: 'dark', label: t('theme.dark')},
        ]}
      />
      {mobileExtras && (
        <>
          <section className="settings__group" aria-labelledby="mx-lang">
            <h3 id="mx-lang">{t('lang.title')}</h3>
            <LanguagePanel />
          </section>
          <section className="settings__group" aria-labelledby="mx-file">
            <h3 id="mx-file">{t('file.title')}</h3>
            <FileActions
              variant="stack"
              onDone={() => dispatch({type: 'closeFlyout'})}
            />
          </section>
          {tree && (
            <section className="settings__group" aria-labelledby="mx-export">
              <h3 id="mx-export">{t('export.title')}</h3>
              <ExportPanel />
            </section>
          )}
        </>
      )}
    </div>
  );
}
