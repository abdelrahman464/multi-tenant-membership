import { registerDecorator, ValidationOptions } from 'class-validator';
import { parseBranchHours } from '../utils/branch-hours.util';

export function IsWeeklyHours(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isWeeklyHours',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return value === null || parseBranchHours(value) !== null;
        },
        defaultMessage() {
          return 'hours must be null (always open) or all seven weekdays as { open, close } or null (closed that day)';
        },
      },
    });
  };
}
