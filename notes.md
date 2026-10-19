divvy will be an app that allows users to easily split up or divvy a bill. A use case would be several parties at a restaurant. The main page will load with the latest or current divvy with a list of past divvys along with an option for contacts and contacts management. A divvy is the receipt, along with the parties and the division or split type. A divvy could be items per party, dollar amount or % per party, or any mix. For example, with a receipt involving 4 parties, P1 and P4 could pay some specific items, and 2 and 3 could split the remainder by 50/50.
The split logic will follow these rules in order:
If there is any remaining unassigned amount, provide these 3 options:

1. Selecting an item or items allows it to be assigned to a party assigned to a party, by total line item amt, % or $ amt of line item price
2. Clicking on a party will give the option to pay a $ amount or % amount for the remaining amount

Divvys will have a complete or closed status when all items on the bill have been accounted for or paid

https://codepen.io/hrtzt/pen/NPZKRN
https://codepen.io/roberto3000/pen/vEgMwee

js is the preferred language.
open to backend db. postgresql, sql server, etc..

scanning of receipt should be local using tessaract.js and web workers if available and fallback to server if not. the receipt should contain 3 sections..
line items
subtotal, taxes, tip
final (grand total)
every line item can be editable, as well as the tax and tip. subtotal and final will always be calculated based on those.

for parties/contacts the unique  key will be phone and email concatenated. this means any number of different can have the same phone number so long as they have different emails or vice versa.

\--



the current interface can be advanced/detailed.



my vision for the simple interface:



user scans in receipt

the result will be on one page:

\# of items (e)

each line item name (e) and price (e)

subtotal

tax (e)

tip/misc (e)

grand total



\*(e) = editable

\_\_\_

next page is parties

&#x20;# of paying parties (+ or -, default 2)

party name , option to add email or phone, option to adds phone if email was selected previously, and vice versa)



jack and jill can be the name of 1 party if they are paying as 1



\_\_\_

then next section

items and parties. items can be dragged to parties

if item is first dragged to party A, then 100%, then item is dragged to party b (50%), etc

parties can be dragged to item price/cost in settings . default to no



before implementiNG..what are your thoughts and feedback





















































































upon initializing, if there does not exist a contact record for the user, a form to complete or create one will pop up. This will also serve as the user registration. A contact record must have a name, and either a value for the email or phone number field. This will also require verification by either email code or SMS code.

ideally there should be only divvy per event. This means if party 1 scans the receipt and adds party 2, if party 2 is also a member, they will be viewing the same receipt and divvy that p1 just scanned.

A scanned receipt should have 3 main sections
items
subtotal - taxes, fees, misc
(grand) total

the items and subtotal should have an option to manually edit and overwrite. the final grand total will be calculated

The scanning  of the receipt should occur locally if possibly using web workers and a js library. If not available, the scanning will be performed on the server.

a future feature will be to gamify the divvys with analytics in categories such as Pizza Boss, or Thriftiest divver, etc

