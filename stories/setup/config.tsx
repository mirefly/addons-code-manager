import {
  addDecorator,
  addParameters,
  configure,
  setAddon,
} from '@storybook/react';
// For some reasons, the CRA build step fails because TypeScript cannot find a
// valid declaration file for this module. Yet, there is a valid declaration
// file and it works in all other contexts.
// @ts-ignore
import chaptersAddon, { setDefaults } from 'react-storybook-addon-chapters';
import { withRootAttribute } from 'storybook-addon-root-attribute';
import requireContext from 'require-context.macro';

import configureApplication from '../../src/configureApplication';
import { rootAttributeParams } from '../utils';

// Include application styles.
import '../../src/styles.scss';
// Apply some custom styles to storybook.
import './styles.scss';

configureApplication();

// Automatically import all files ending in *.stories.tsx
const req = requireContext('../', true, /.stories.tsx$/);

addDecorator(withRootAttribute);

addParameters({
  options: {
    showPanel: false,
  },
  ...rootAttributeParams(),
});

setDefaults({
  sectionOptions: {
    showSource: false,
  },
});
setAddon(chaptersAddon);

const loadStories = () => req.keys().forEach(req);
configure(loadStories, module);
