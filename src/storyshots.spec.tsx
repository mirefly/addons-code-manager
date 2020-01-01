import initStoryshots from '@storybook/addon-storyshots';
import { imageSnapshot } from '@storybook/addon-storyshots-puppeteer';
import { setTimeout } from 'timers';

const beforeScreenshot = () => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, 500);
  });
};

const getMatchOptions = () => {
  return {
    failureThreshold: 0.01,
    failureThresholdType: 'percent',
  };
};

initStoryshots({
  configPath: 'stories/setup',
  suite: 'Image storyshots',
  test: imageSnapshot({
    storybookUrl: 'http://localhost:9001',
    beforeScreenshot,
    getMatchOptions,
  }),
});
