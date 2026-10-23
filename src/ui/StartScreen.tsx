import {useIntl} from 'react-intl';
import {FileActions} from './FileActions';
import {Icon, Logo} from './icons';
import './start.css';

export function StartScreen() {
  const intl = useIntl();
  const t = (id: string) => intl.formatMessage({id});
  return (
    <div className="start">
      <div className="start__inner">
        <Logo />
        <h1 className="start__title">{t('app.name')}</h1>
        <p className="start__lead">{t('start.lead')}</p>
        <div className="start__drop">
          <Icon name="upload" size={28} strokeWidth={1.6} />
          <p className="start__drop-text">{t('start.drop')}</p>
          <p className="start__formats">{t('start.formats')}</p>
          <FileActions variant="hero" />
        </div>
        <p className="start__privacy">{t('start.privacy')}</p>
      </div>
    </div>
  );
}
