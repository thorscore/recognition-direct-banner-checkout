export const pickupAddress = '8680 Troy St. Spring Valley, CA 91977';
export const deliveryLabels = Object.freeze({
  ship:'Ship',
  'pickup-spring-valley':`Pickup at ${pickupAddress}`,
  'pickup-la-mesa':'La Mesa pickup (original request)',
  'pickup-pine-valley':'Pine Valley pickup (original request)'
});
export const deliveryOptions = ['ship','pickup-spring-valley'];
export const deliveryLabel = value => deliveryLabels[value] || 'Delivery needs staff review';
