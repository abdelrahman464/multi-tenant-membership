import {
  mergeAuditMetadata,
  pickBodyMetadata,
} from './audit-metadata.util';

describe('pickBodyMetadata', () => {
  const sold = {
    memberCreated: true,
    member: { id: 'mem-1' },
    payment: { id: 'pay-1' },
    checkIn: null,
  };

  it('copies nested ids and skips null', () => {
    expect(
      pickBodyMetadata(sold, {
        memberId: 'member.id',
        paymentId: 'payment.id',
        checkInId: 'checkIn.id',
        memberCreated: 'memberCreated',
      }),
    ).toEqual({
      memberId: 'mem-1',
      paymentId: 'pay-1',
      memberCreated: 'true',
    });
  });

  it('returns null when nothing matches', () => {
    expect(pickBodyMetadata({}, { memberId: 'member.id' })).toBeNull();
  });
});

describe('mergeAuditMetadata', () => {
  it('merges static labels with body ids', () => {
    expect(
      mergeAuditMetadata({ resource: 'dayPass' }, { memberId: 'mem-1' }),
    ).toEqual({ resource: 'dayPass', memberId: 'mem-1' });
  });
});
