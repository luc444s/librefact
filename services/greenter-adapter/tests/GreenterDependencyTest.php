<?php

declare(strict_types=1);

use Greenter\See;
use PHPUnit\Framework\TestCase;

final class GreenterDependencyTest extends TestCase
{
    public function testGreenterSeeIsAutoloadable(): void
    {
        self::assertTrue(class_exists(See::class));
    }
}
