import * as React from 'react';
import {
  createContext,
  createRef,
  useCallback,
  useEffect,
  useRef,
} from 'react';

import { VariableSizeList, ListProps } from 'react-window';

export const ListContext = createContext<{ updateHeightMap?: any }>({});

type Props = {
  innerElementType: ListProps['innerElementType'];
  rowCount: number;
  rowRenderer: ListProps['children'];
};

export const Measurer: React.FC<{
  children: (params: {
    style: React.CSSProperties;
    ref: any;
  }) => React.ReactNode;
  index: number;
  style: React.CSSProperties;
}> = ({ children, index, style }) => {
  const divRef = createRef<HTMLDivElement>();

  const { updateHeightMap } = React.useContext(ListContext);

  useEffect(() => {
    if (divRef.current && divRef.current.hasChildNodes) {
      updateHeightMap(index, divRef.current.getBoundingClientRect().height);
    } else {
      //    updateHeightMap(index, 0);
    }
  });

  return <>{children({ style, ref: divRef })}</>;
};

const CodeWindow: React.FC<Props> = ({
  innerElementType,
  rowCount,
  rowRenderer,
}) => {
  const listRef = createRef<VariableSizeList>();
  const heightMap = useRef<{ [index: number]: number }>({});
  const updateHeightMap = useCallback((index: number, height: number) => {
    heightMap.current = { ...heightMap.current, [index]: height };
  }, []);
  const getHeight = useCallback((index) => heightMap.current[index] || 19, []);

  useEffect(() => {
    console.error(heightMap);
    if (listRef.current) listRef.current.resetAfterIndex(0, true);
  });

  console.error(heightMap);

  return (
    <ListContext.Provider value={{ updateHeightMap }}>
      <VariableSizeList
        itemSize={getHeight}
        itemCount={rowCount}
        overscanCount={10}
        estimatedItemSize={19}
        height={500}
        width={'auto'}
        innerElementType={innerElementType}
        outerElementType={'div'}
        onItemsRendered={({ overscanStartIndex }) => {
          console.log(overscanStartIndex);
          if (listRef.current)
            listRef.current.resetAfterIndex(overscanStartIndex, false);
        }}
        ref={listRef}
      >
        {rowRenderer}
      </VariableSizeList>
    </ListContext.Provider>
  );
  return null;
};

export default CodeWindow;
