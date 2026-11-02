import {test,expect} from '@playwright/test';
test.skip(process.env.PRODUCTION_PREVIEW_TEST!=='1','Requires isolated production runner');
for(const width of [1280,390])test(`MeetSafe full independent workflow and reset at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});const requests:string[]=[];
 page.on('request',r=>{if(['fetch','xhr'].includes(r.resourceType())||r.method()!=='GET')requests.push(r.url());});
 await page.goto('/meetsafe');await page.getByRole('button',{name:'Run MeetSafe Demo'}).click();
 await expect(page.getByRole('status')).toHaveText('Deal Confirmed — Pickup Pending');
 await page.getByRole('button',{name:'Propose pickup',exact:true}).click();
 await expect(page.getByRole('status')).toHaveText('Deal Confirmed — Pickup Pending');
 await page.getByLabel('My fictional appearance (optional)').fill('Blue hoodie, black headset case');await page.getByRole('button',{name:'Save recognition details'}).click();
 await page.getByRole('button',{name:'Buyer View',exact:true}).click();await expect(page.getByText('Blue hoodie, black headset case',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Accept pickup terms'}).click();await expect(page.getByRole('status')).toHaveText('Pickup Scheduled');
 await page.getByRole('button',{name:'Reveal demo code'}).click();const code=await page.getByLabel('Demo exchange code',{exact:true}).innerText();
 await page.getByRole('button',{name:'Seller View',exact:true}).click();await page.getByLabel('Enter buyer’s demo code').fill('wrong');await page.getByRole('button',{name:'Verify demo code'}).click();await expect(page.getByRole('alert',{name:'MeetSafe error'})).toContainText('Invalid demo code');
 await page.getByLabel('Enter buyer’s demo code').fill(code);await page.getByRole('button',{name:'Verify demo code'}).click();await expect(page.getByRole('status')).toContainText('Trading Partner Verified');await expect(page.getByRole('button',{name:'Verify demo code'})).toBeDisabled();
 await expect(page.getByRole('button',{name:'I received and inspected the item.'})).toHaveCount(0);
 await page.getByRole('button',{name:'I handed over the item.',exact:true}).click();await expect(page.getByRole('status')).not.toHaveText('Exchange Completed');await expect(page.getByRole('button',{name:'I handed over the item.',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Submit simulated review'})).toHaveCount(0);
 await page.getByRole('button',{name:'Buyer View',exact:true}).click();await expect(page.getByRole('button',{name:'I handed over the item.'})).toHaveCount(0);await page.getByRole('button',{name:'I received and inspected the item.',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Exchange Completed');
 await page.getByLabel('Star rating').selectOption('4');await page.getByLabel('Written review (optional)').fill('Clear communication — demo only.');await page.getByRole('button',{name:'Submit simulated review'}).click();await expect(page.getByRole('button',{name:'Submit simulated review'})).toHaveCount(0);
 await page.getByRole('button',{name:'Seller View',exact:true}).click();await page.getByRole('button',{name:'Submit simulated review'}).click();await expect(page.getByRole('heading',{name:'Both simulated reviews submitted'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Reset Demo',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Deal Confirmed — Pickup Pending');await expect(page.getByRole('heading',{name:'Both simulated reviews submitted'})).toHaveCount(0);
 await page.getByRole('button',{name:'Propose pickup',exact:true}).click();await page.getByRole('button',{name:'Buyer View',exact:true}).click();await page.getByRole('button',{name:'Accept pickup terms'}).click();await page.getByRole('button',{name:'Reveal demo code'}).click();expect(await page.getByLabel('Demo exchange code',{exact:true}).innerText()).not.toBe(code);
 expect(requests).toEqual([]);
});
test('MeetSafe navigation, invalid date, counterproposal and issue resolution',async({page})=>{
 await page.goto('/');await page.getByRole('link',{name:'MeetSafe Demo',exact:true}).click();await expect(page).toHaveURL(/\/meetsafe$/);await page.getByRole('button',{name:'Run MeetSafe Demo'}).click();
 await page.getByLabel('Meeting date',{exact:true}).fill('2020-01-01');await page.getByRole('button',{name:'Propose pickup',exact:true}).click();await expect(page.getByRole('alert',{name:'MeetSafe error'})).toContainText('future');
 await page.getByRole('button',{name:'Reset Demo',exact:true}).click();await page.getByRole('button',{name:'Propose pickup',exact:true}).click();await page.getByRole('button',{name:'Buyer View',exact:true}).click();await page.getByLabel('Meeting time',{exact:true}).fill('16:00');await page.getByRole('button',{name:'Propose new pickup terms'}).click();await expect(page.getByRole('status')).toHaveText('Deal Confirmed — Pickup Pending');await page.getByRole('button',{name:'Seller View',exact:true}).click();await page.getByRole('button',{name:'Accept pickup terms'}).click();await expect(page.getByRole('status')).toHaveText('Pickup Scheduled');
 await page.getByLabel('Issue reason').selectOption('Meeting needs to be rescheduled');await page.getByRole('button',{name:'Report an Issue',exact:true}).click();await expect(page.getByRole('status')).toContainText('Issue pending');await expect(page.getByRole('button',{name:'Verify demo code'})).toBeDisabled();await page.getByRole('button',{name:'Resolve simulated issue'}).click();await expect(page.getByRole('status')).toHaveText('Pickup Scheduled');await page.getByRole('button',{name:'Cancel demo exchange'}).click();await expect(page.getByRole('status')).toHaveText('Demo exchange cancelled');
});

test('MeetSafe keyboard controls expose role state and labeled fields',async({page})=>{
 await page.goto('/meetsafe');
 await page.keyboard.press('Tab');
 await expect(page.getByRole('link',{name:'Back to SwApStEr'})).toBeFocused();
 await page.keyboard.press('Tab');
 await expect(page.getByRole('button',{name:'Run MeetSafe Demo'})).toBeFocused();
 await page.keyboard.press('Enter');
 await expect(page.getByRole('button',{name:'Seller View',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.keyboard.press('Tab'); // Reset
 await page.keyboard.press('Tab'); // Buyer View
 await expect(page.getByRole('button',{name:'Buyer View',exact:true})).toBeFocused();
 await page.keyboard.press('Space');
 await expect(page.getByRole('button',{name:'Buyer View',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('button',{name:'Seller View',exact:true})).toHaveAttribute('aria-pressed','false');
 await expect(page.getByRole('button',{name:'Reveal demo code'})).toBeDisabled();
 await page.keyboard.press('Tab'); // Seller View
 await page.keyboard.press('Tab'); // Public meeting location
 await expect(page.getByLabel('Public meeting location',{exact:true})).toBeFocused();
 await expect(page.getByRole('list',{name:'Exchange progress'})).toContainText('Pickup Scheduled pending');
});
