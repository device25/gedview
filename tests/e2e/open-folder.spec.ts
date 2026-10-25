import {expect, test} from '@playwright/test';

// A folder with the tree, its photo, and a hidden copy (.claude) that
// must not be taken for the tree.
const FOLDER = 'tests/fixtures/synthetic/folder-tree';

test('«Открыть папку» opens the tree in a folder with its photos', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', {name: 'Открыть папку'})).toBeVisible();
  await page.getByTestId('folder-input').setInputFiles(FOLDER);
  const card = page.getByRole('complementary');
  await expect(card).toContainText('Анна Папкина');
  // The photo comes from the folder, straight from disk.
  await expect(page.locator('g.gv-photo[data-for="I1"]')).toHaveAttribute(
    'data-photo',
    '',
  );
});
