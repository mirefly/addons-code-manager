import * as React from 'react';
import { withRouter, Link, RouteComponentProps } from 'react-router-dom';
import makeClassName from 'classnames';
import {
  AutoSizer,
  CellMeasurer,
  CellMeasurerCache,
  List,
} from 'react-virtualized';

import styles from './styles.module.scss';
import Commentable from '../Commentable';
import CommentList from '../CommentList';
import FadableContent from '../FadableContent';
import LinterMessage from '../LinterMessage';
import {
  getCodeLineAnchor,
  getCodeLineAnchorID,
  getLines,
  mapWithDepth,
  GLOBAL_LINTER_ANCHOR_ID,
} from './utils';
import refractor from '../../refractor';
import {
  gettext,
  getLanguageFromMimeType,
  shouldAllowSlowPages,
} from '../../utils';
import { Version } from '../../reducers/versions';
import LinterProvider, { LinterProviderInfo } from '../LinterProvider';
import GlobalLinterMessages from '../GlobalLinterMessages';
import SlowPageAlert from '../SlowPageAlert';

let cache = new CellMeasurerCache({
  fixedWidth: true,
  defaultHeight: 20,
});

let list: any = undefined;

let mostRecentWidth: number | undefined;

// This is how many lines of code it takes to slow down the UI.
const SLOW_LOADING_LINE_COUNT = 1000;

// This function mimics what https://github.com/rexxars/react-refractor does,
// but we need a different layout to inline comments so we cannot use this
// component. It also optionally does not highlight the code at all.
const renderCode = ({
  code,
  language,
  shouldHighlight,
}: {
  code: string;
  language: string;
  shouldHighlight: boolean;
}) => {
  let value;
  if (shouldHighlight) {
    const ast = refractor.highlight(code, language);
    value = ast.length === 0 ? code : ast.map(mapWithDepth(0));
  }

  return (
    <pre className={styles.highlightedCode}>
      <code
        className={makeClassName(
          styles.innerHighlightedCode,
          `language-${language}`,
        )}
      >
        {value || code}
      </code>
    </pre>
  );
};

const isLineSelected = (
  id: string,
  location: RouteComponentProps['location'],
) => {
  return `#${id}` === location.hash;
};

export const scrollToSelectedLine = (element: HTMLElement | null) => {
  if (element) {
    element.scrollIntoView();
  }
};

export type PublicProps = {
  mimeType: string;
  content: string;
  version: Version;
};

export type DefaultProps = {
  _scrollToSelectedLine: typeof scrollToSelectedLine;
  _slowLoadingLineCount: number;
  enableCommenting: boolean;
};

type Props = PublicProps & DefaultProps & RouteComponentProps;

export class CodeViewBase extends React.Component<Props> {
  static defaultProps: DefaultProps = {
    _scrollToSelectedLine: scrollToSelectedLine,
    _slowLoadingLineCount: SLOW_LOADING_LINE_COUNT,
    enableCommenting: process.env.REACT_APP_ENABLE_COMMENTING === 'true',
  };

  list: any = undefined;

  renderWithLinterInfo = ({ selectedMessageMap }: LinterProviderInfo) => {
    const {
      _scrollToSelectedLine,
      _slowLoadingLineCount,
      content,
      enableCommenting,
      location,
      mimeType,
      version,
    } = this.props;

    const language = getLanguageFromMimeType(mimeType);
    let codeLines = getLines(content);
    let codeWasTrimmed = false;
    let slowAlert;

    const rowRenderer = ({
      index: i,
      key,
      parent,
      style,
    }: {
      index: number;
      key: any;
      parent: any;
      style: any;
    }) => {
      const code = codeLines[i];
      const line = i + 1;
      const id = getCodeLineAnchorID(line);

      let className = styles.line;
      let shellRef;

      if (isLineSelected(id, location)) {
        className = makeClassName(className, styles.selectedLine);
        shellRef = _scrollToSelectedLine;
      }

      return (
        <CellMeasurer
          cache={cache}
          columnIndex={0}
          parent={parent}
          rowIndex={i}
          key={key}
        >
          <div key={`fragment-${line}`} style={style}>
            <Commentable
              as="tr"
              id={id}
              className={className}
              line={line}
              fileName={version.selectedPath}
              shellRef={shellRef}
              versionId={version.id}
            >
              {(addCommentButton) => (
                <>
                  <td className={styles.lineNumber}>
                    <Link
                      className={styles.lineNumberLink}
                      to={{
                        ...location,
                        hash: getCodeLineAnchor(line),
                      }}
                    >{`${line}`}</Link>
                    {enableCommenting && addCommentButton}
                  </td>

                  <td className={styles.code}>
                    {renderCode({
                      code,
                      language,
                      shouldHighlight: !codeWasTrimmed,
                    })}
                  </td>
                </>
              )}
            </Commentable>
            {selectedMessageMap && selectedMessageMap.byLine[line] && (
              <tr>
                <td
                  id={`line-${line}-messages`}
                  className={styles.linterMessages}
                  colSpan={2}
                >
                  {selectedMessageMap.byLine[line].map((msg) => {
                    return <LinterMessage inline key={msg.uid} message={msg} />;
                  })}
                </td>
              </tr>
            )}
            {enableCommenting && (
              <CommentList
                addonId={version.addon.id}
                fileName={version.selectedPath}
                line={line}
                versionId={version.id}
              >
                {(commentList) => (
                  <tr>
                    <td colSpan={2}>{commentList}</td>
                  </tr>
                )}
              </CommentList>
            )}
          </div>
        </CellMeasurer>
      );
    };

    if (codeLines.length >= _slowLoadingLineCount) {
      if (!shouldAllowSlowPages({ location })) {
        codeLines = codeLines.slice(0, _slowLoadingLineCount);
        codeWasTrimmed = true;
      }
      slowAlert = (
        <SlowPageAlert
          location={location}
          getMessage={(allowSlowPages: boolean) => {
            return allowSlowPages
              ? gettext('This file is loading slowly.')
              : gettext(
                  'This file has been shortened, and highlighting has been disabled, to load faster.',
                );
          }}
          getLinkText={(allowSlowPages: boolean) => {
            return allowSlowPages
              ? gettext('View a shortened file.')
              : gettext('View the original file.');
          }}
        />
      );
    }

    return (
      <>
        <GlobalLinterMessages
          containerRef={
            isLineSelected(
              getCodeLineAnchorID(GLOBAL_LINTER_ANCHOR_ID),
              location,
            )
              ? _scrollToSelectedLine
              : undefined
          }
          // This forces a remount for all location changes which
          // keeps the containerRef in sync with location.
          // See https://github.com/mozilla/addons-code-manager/issues/905
          key={location.key}
          messages={selectedMessageMap && selectedMessageMap.global}
        />

        {slowAlert}

        <FadableContent fade={codeWasTrimmed}>
          <div className={styles.CodeView}>
            <table className={styles.table}>
              <tbody className={styles.tableBody}>
                <AutoSizer style={{ height: '600px' }}>
                  {(autoSizerParams) => {
                    if (
                      mostRecentWidth &&
                      mostRecentWidth !== autoSizerParams.width
                    ) {
                      cache.clearAll();
                      if (list) {
                        list.recomputeRowHeights();
                      }
                    }

                    mostRecentWidth = autoSizerParams.width;

                    return (
                      <List
                        deferredMeasurementCache={cache}
                        height={autoSizerParams.height}
                        overscanRowCount={100}
                        rowCount={codeLines.length}
                        rowHeight={cache.rowHeight}
                        width={autoSizerParams.width}
                        rowRenderer={rowRenderer}
                        ref={(ref) => {
                          list = ref;
                        }}
                      />
                    );
                  }}
                </AutoSizer>
              </tbody>
            </table>
          </div>
        </FadableContent>
        {/* Only show a slow alert at the bottom if the code was trimmed. */}
        {codeWasTrimmed && slowAlert}
      </>
    );
  };

  render() {
    const { version } = this.props;

    return (
      <LinterProvider
        versionId={version.id}
        validationURL={version.validationURL}
        selectedPath={version.selectedPath}
      >
        {// This needs to be an anonymous function (which defeats memoization)
        // so that the component gets re-rendered in the case of adding
        // comments per line.
        (info: LinterProviderInfo) => this.renderWithLinterInfo(info)}
      </LinterProvider>
    );
  }
}

export default withRouter(CodeViewBase) as React.ComponentType<
  PublicProps & Partial<DefaultProps>
>;
