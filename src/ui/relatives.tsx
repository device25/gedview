import {Button} from 'react-aria-components';
import {useIntl, type IntlShape} from 'react-intl';
import type {ChildLinkStatus} from '../gedcom/types';
import type {ParentGroup} from './treeInfo';
import {hidingMarks} from './treeInfo';

/** "Parents · adoptive «phrase»"; plain "Parents" for a birth link on request. */
export function parentsLabel(
  intl: IntlShape,
  g: Pick<ParentGroup, 'pedigree' | 'pedigreePhrase'>,
  opts: {plainBirth?: boolean} = {},
): string {
  let label: string;
  if (!g.pedigree || (opts.plainBirth && g.pedigree === 'BIRTH')) {
    label = intl.formatMessage({id: 'rel.parents'});
  } else if (`rel.parents.${g.pedigree}` in intl.messages) {
    label = intl.formatMessage({id: `rel.parents.${g.pedigree}`});
  } else {
    label = intl.formatMessage(
      {id: 'rel.parents.custom'},
      {type: g.pedigree.toLowerCase()},
    );
  }
  return g.pedigreePhrase ? `${label} «${g.pedigreePhrase}»` : label;
}

export function statusText(intl: IntlShape, status: ChildLinkStatus): string {
  return intl.formatMessage({id: `status.${status}`});
}

/** "2 hidden: marked «confidential»" with a button to show them. */
export function HiddenNote({
  records,
  onReveal,
}: {
  records: ReadonlyArray<{restrictions?: readonly string[]}>;
  onReveal: () => void;
}) {
  const intl = useIntl();
  const marks = intl.formatList(
    hidingMarks(records).map((m) =>
      intl.formatMessage(
        {id: 'card.mark'},
        {mark: intl.formatMessage({id: `resn.${m}`})},
      ),
    ),
    {type: 'conjunction'},
  );
  return (
    <div role="note" className="hidden-note">
      <span>
        {intl.formatMessage(
          {id: 'card.hidden'},
          {count: records.length, marks},
        )}
      </span>
      <Button className="btn btn--small" onPress={onReveal}>
        {intl.formatMessage({id: 'card.reveal'})}
      </Button>
    </div>
  );
}
